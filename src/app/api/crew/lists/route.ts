import { z } from "zod";
import { CORE_LANGS } from "@/lib/types";
import { translationTargets } from "@/lib/server/ai";
import { requireMe } from "@/lib/server/auth";
import { betaOnly, crewDTO, crewLangs, crewLists, ensureSafetyPoints } from "@/lib/server/crew";
import { db, ok, overLimit } from "@/lib/server/db";
import { body, fail, json, notFound, route } from "@/lib/server/http";
import { i18nAll } from "@/lib/server/tasks";

export const runtime = "nodejs";

type Kind = "place" | "action" | "safety";
const table = (kind: Kind) => (kind === "place" ? "site_places" : kind === "action" ? "site_actions" : "site_safety_points");
const KIND = z.enum(["place", "action", "safety"]);

/** Add a list item from a label in the caller's language; the other core languages and the crew's beta languages are translated (or copied). */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({ kind: KIND, label: z.string().trim().min(1).max(80) }));
  if (await overLimit(me.id, "list_add", 10)) return fail(429, "rate_limited");
  if (b.kind !== "safety" && b.label.length > 40) return fail(400, "invalid", "label: at most 40 characters");
  if (b.kind === "safety") await ensureSafetyPoints(me.crew_id);   // seed first, or the defaults would never come
  const [lists, langs] = await Promise.all([crewLists(me.crew_id), crewLangs(me.crew_id)]);
  const labels = await i18nAll(b.label, me.language, lists, translationTargets(langs, CORE_LANGS));
  const last = ok(await db().from(table(b.kind)).select("sort").eq("crew_id", me.crew_id).order("sort", { ascending: false }).limit(1)) as { sort: number }[];
  ok(await db().from(table(b.kind)).insert({
    crew_id: me.crew_id, label_en: labels.en, label_hi: labels.hi ?? labels.en, label_ta: labels.ta ?? labels.en, labels_beta: betaOnly(labels), sort: (last[0]?.sort ?? -1) + 1,
  }));
  return json({ crew: await crewDTO(me.crew_id, me.language) });
});

/** Remove a list item; refused while any task uses it. */
export const DELETE = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({ kind: KIND, id: z.uuid() }));
  if (b.kind === "safety") {
    // never hard-deleted: briefings already sent keep the words they were given
    const gone = ok(await db().from("site_safety_points").update({ removed_at: new Date().toISOString() })
      .eq("id", b.id).eq("crew_id", me.crew_id).is("removed_at", null).select("id"));
    if (!gone.length) return notFound();
    return json({ crew: await crewDTO(me.crew_id, me.language) });
  }
  const used = await db().from("tasks").select("id", { count: "exact", head: true }).eq(b.kind === "place" ? "place_id" : "action_id", b.id);
  if (used.error) throw new Error(`db: ${used.error.message}`);
  if (used.count) return fail(409, "conflict", "a task uses this item");
  const del = ok(await db().from(table(b.kind)).delete().eq("id", b.id).eq("crew_id", me.crew_id).select("id"));
  if (!del.length) return notFound();
  return json({ crew: await crewDTO(me.crew_id, me.language) });
});
