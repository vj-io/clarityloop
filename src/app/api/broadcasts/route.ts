import { objectAliases } from "@/lib/server/ai";
import { z } from "zod";
import { CARD, type BroadcastSummary } from "@/lib/types";
import { requireMe, type ProfileRow } from "@/lib/server/auth";
import { broadcastDTO, type BroadcastRowDb } from "@/lib/server/broadcasts";
import { isUnderstood } from "@/lib/server/board";
import { postCard } from "@/lib/server/cards";
import { ensureConversation, ensureCrewConversation } from "@/lib/server/conversations";
import { crewLists } from "@/lib/server/crew";
import { audit, db, ok } from "@/lib/server/db";
import { body, fail, json, notFound, route } from "@/lib/server/http";
import { i18nAll, type TaskRow } from "@/lib/server/tasks";
import type { TaskState } from "@/lib/types";

export const runtime = "nodejs";

const Body = z.object({
  action_id: z.uuid(),
  object_text: z.string().trim().min(1).max(80),
  place_id: z.uuid(),
  due_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quantity: z.number().nonnegative().max(1_000_000).nullish(),
  unit: z.string().trim().min(1).max(20).nullish(),
  note: z.string().trim().max(280).nullish(),
  is_safety: z.boolean().optional(),
});

/**
 * One task to the whole crew. Object and note are translated once; every worker gets an ordinary task
 * (same meaning check as a pair task) in their own pair conversation, and the crew channel gets the board.
 */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const b = await body(req, Body);
  if (!me.crew_id) return notFound();
  const crewId = me.crew_id;
  const [lists, crew, ws] = await Promise.all([
    crewLists(crewId),
    db().from("crews").select("supervisor_id, is_sandbox").eq("id", crewId).single(),
    db().from("profiles").select("*").eq("crew_id", crewId).eq("role", "worker").order("created_at"),
  ]);
  const c = ok(crew) as { supervisor_id: string; is_sandbox: boolean };
  if (c.supervisor_id !== me.id) return fail(403, "forbidden");
  if (!lists.actions.some((a) => a.id === b.action_id) || !lists.places.some((p) => p.id === b.place_id)) return fail(400, "invalid", "action or place is not in this crew's lists");
  const workers = ok(ws) as ProfileRow[];
  if (!workers.length) return fail(409, "conflict", "no workers in this crew yet");

  // Channels first (Nexconn can fail): nothing is written until every conversation exists.
  const [crewConv, ...pairs] = await Promise.all([ensureCrewConversation(crewId), ...workers.map((w) => ensureConversation(me, w))]);
  const note = b.note || null;
  const object_i18n = await i18nAll(b.object_text, me.language, lists);
  const [object_aliases, note_i18n] = await Promise.all([
    objectAliases(object_i18n.en),
    note ? i18nAll(note, me.language, lists) : Promise.resolve({}),
  ]);
  const fields = {
    action_id: b.action_id, object_text: b.object_text, object_i18n, object_aliases, place_id: b.place_id, due_time: b.due_time,
    quantity: b.quantity ?? null, unit: b.quantity == null ? null : b.unit ?? null, note, note_i18n, is_sandbox: c.is_sandbox,
  };
  const bc = ok(await db().from("broadcasts").insert({
    ...fields, crew_id: crewId, conversation_id: crewConv.id, supervisor_id: me.id, is_safety: b.is_safety ?? false,
  }).select("*").single()) as BroadcastRowDb;
  const tasks = ok(await db().from("tasks").insert(workers.map((w, i) => ({
    ...fields, conversation_id: pairs[i].id, supervisor_id: me.id, worker_id: w.id, state: "waiting", broadcast_id: bc.id,
  }))).select("*")) as TaskRow[];
  await Promise.all([
    audit(null, me.id, "broadcast_created", { broadcast_id: bc.id, tasks: tasks.map((t) => t.id), is_safety: bc.is_safety }),
    ...tasks.map((t) => audit(t.id, me.id, "task_created", { to: "waiting", broadcast_id: bc.id })),
  ]);
  await Promise.all([
    ...tasks.map((t) => postCard(t.conversation_id, CARD.TASK + t.id)),
    postCard(crewConv.id, CARD.BOARD + bc.id),
  ]);
  return json({ broadcast: await broadcastDTO(bc, me) });
});

/** Supervisor: recent crew tasks with their progress, newest first. */
export const GET = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const bs = ok(await db().from("broadcasts").select("*").eq("supervisor_id", me.id).order("created_at", { ascending: false }).limit(30)) as BroadcastRowDb[];
  if (!bs.length) return json({ broadcasts: [] });
  const kids = ok(await db().from("tasks").select("broadcast_id, state").in("broadcast_id", bs.map((x) => x.id))) as { broadcast_id: string; state: TaskState }[];
  const lists = await crewLists(bs[0].crew_id);
  const lang = me.language;
  const lab = (kind: "places" | "actions", id: string) => lists[kind].find((x) => x.id === id)?.labels[lang] ?? id;
  const broadcasts: BroadcastSummary[] = bs.map((x) => {
    const mine = kids.filter((k) => k.broadcast_id === x.id);
    return {
      id: x.id, conversation_id: x.conversation_id, created_at: x.created_at, is_safety: x.is_safety,
      action: lab("actions", x.action_id), object: x.object_i18n[lang] ?? x.object_text, place: lab("places", x.place_id), due_time: x.due_time,
      progress: { understood: mine.filter((k) => isUnderstood(k.state)).length, total: mine.length },
    };
  });
  return json({ broadcasts });
});
