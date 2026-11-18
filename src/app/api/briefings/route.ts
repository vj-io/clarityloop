import { z } from "zod";
import { CARD, inLang, type BriefingSummary } from "@/lib/types";
import { translationTargets } from "@/lib/server/ai";
import { MAX_POINTS, MIN_POINTS } from "@/lib/briefing";
import { requireMe, type ProfileRow } from "@/lib/server/auth";
import { briefingDTO, type BriefingRowDb, type ReplyRowDb } from "@/lib/server/briefings";
import { postCard } from "@/lib/server/cards";
import { ensureConversation, ensureCrewConversation } from "@/lib/server/conversations";
import { crewLangs, crewLists, safetyPoints } from "@/lib/server/crew";
import { audit, db, ok, overLimit } from "@/lib/server/db";
import { body, fail, json, notFound, route } from "@/lib/server/http";
import { i18nAll } from "@/lib/server/tasks";

export const runtime = "nodejs";

const Body = z.object({
  point_ids: z.array(z.uuid()).min(MIN_POINTS).max(MAX_POINTS).refine((a) => new Set(a).size === a.length, "points must be different"),
  place_id: z.uuid().nullish(),
  note: z.string().trim().max(200).nullish(),
});

/**
 * Safety briefing: 2-5 points from the crew's list go to every worker. Each worker gets the briefing card in
 * their own pair chat (to say it back privately); the crew channel gets the roll call.
 */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const b = await body(req, Body);
  if (!me.crew_id) return notFound();
  if (await overLimit(me.id, "briefing", 6)) return fail(429, "rate_limited");
  const crewId = me.crew_id;
  const [points, lists, crew, ws] = await Promise.all([
    safetyPoints(crewId),
    crewLists(crewId),
    db().from("crews").select("supervisor_id, is_sandbox").eq("id", crewId).single(),
    db().from("profiles").select("*").eq("crew_id", crewId).eq("role", "worker").order("created_at"),
  ]);
  const c = ok(crew) as { supervisor_id: string; is_sandbox: boolean };
  if (c.supervisor_id !== me.id) return fail(403, "forbidden");
  const known = new Set(points.map((p) => p.id));
  if (!b.point_ids.every((id) => known.has(id))) return fail(400, "invalid", "a point is not in this crew's safety list");
  if (b.place_id && !lists.places.some((p) => p.id === b.place_id)) return fail(400, "invalid", "place is not in this crew's list");
  const workers = ok(ws) as ProfileRow[];
  if (!workers.length) return fail(409, "conflict", "no workers in this crew yet");

  // Channels first (Nexconn can fail): nothing is written until every conversation exists.
  const [crewConv, ...pairs] = await Promise.all([ensureCrewConversation(crewId), ...workers.map((w) => ensureConversation(me, w))]);
  const note = b.note || null;
  const note_i18n = note ? await i18nAll(note, me.language, lists, translationTargets(await crewLangs(crewId))) : {};
  const br = ok(await db().from("briefings").insert({
    crew_id: crewId, conversation_id: crewConv.id, supervisor_id: me.id, point_ids: b.point_ids,
    place_id: b.place_id ?? null, note, note_i18n, is_sandbox: c.is_sandbox,
  }).select("*").single()) as BriefingRowDb;
  ok(await db().from("briefing_replies").insert(workers.map((w, i) => ({
    briefing_id: br.id, worker_id: w.id, conversation_id: pairs[i].id, state: "waiting",
  }))).select("id"));
  await audit(null, me.id, "briefing_created", { briefing_id: br.id, points: b.point_ids, workers: workers.map((w) => w.id) });
  await Promise.all([
    ...pairs.map((p) => postCard(p.id, CARD.BRIEF + br.id)),
    postCard(crewConv.id, CARD.BRIEF + br.id),
  ]);
  return json({ briefing: await briefingDTO(br, me) });
});

/** Supervisor: recent briefings with their progress, newest first. */
export const GET = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const bs = ok(await db().from("briefings").select("*").eq("supervisor_id", me.id).order("created_at", { ascending: false }).limit(30)) as BriefingRowDb[];
  if (!bs.length) return json({ briefings: [] });
  const [reps, points] = await Promise.all([
    db().from("briefing_replies").select("briefing_id, state").in("briefing_id", bs.map((x) => x.id)),
    safetyPoints(bs[0].crew_id, true),
  ]);
  const rs = ok(reps) as Pick<ReplyRowDb, "briefing_id" | "state">[];
  const byId = new Map(points.map((p) => [p.id, p]));
  const briefings: BriefingSummary[] = bs.map((x) => {
    const mine = rs.filter((r) => r.briefing_id === x.id);
    return {
      id: x.id, conversation_id: x.conversation_id, created_at: x.created_at,
      points: x.point_ids.map((id) => ({ id, label: inLang(byId.get(id)?.labels ?? { en: "", hi: "", ta: "" }, me.language), labels: byId.get(id)?.labels ?? { en: "", hi: "", ta: "" } })),
      progress: { understood: mine.filter((r) => r.state === "understood").length, total: mine.length },
    };
  });
  return json({ briefings });
});
