import { z } from "zod";
import { requireMe } from "@/lib/server/auth";
import { crewDTO, crewLists } from "@/lib/server/crew";
import { db, ok } from "@/lib/server/db";
import { body, fail, json, notFound, route } from "@/lib/server/http";
import { i18nAll } from "@/lib/server/tasks";

export const runtime = "nodejs";

const table = (kind: "place" | "action") => (kind === "place" ? "site_places" : "site_actions");

/** Add a list item from a label in the caller's language; the other two are translated (or copied). */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({ kind: z.enum(["place", "action"]), label: z.string().trim().min(1).max(40) }));
  const labels = await i18nAll(b.label, me.language, await crewLists(me.crew_id));
  const last = ok(await db().from(table(b.kind)).select("sort").eq("crew_id", me.crew_id).order("sort", { ascending: false }).limit(1)) as { sort: number }[];
  ok(await db().from(table(b.kind)).insert({
    crew_id: me.crew_id, label_en: labels.en, label_hi: labels.hi, label_ta: labels.ta, sort: (last[0]?.sort ?? -1) + 1,
  }));
  return json({ crew: await crewDTO(me.crew_id, me.language) });
});

/** Remove a list item; refused while any task uses it. */
export const DELETE = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({ kind: z.enum(["place", "action"]), id: z.uuid() }));
  const used = await db().from("tasks").select("id", { count: "exact", head: true }).eq(b.kind === "place" ? "place_id" : "action_id", b.id);
  if (used.error) throw new Error(`db: ${used.error.message}`);
  if (used.count) return fail(409, "conflict", "a task uses this item");
  const del = ok(await db().from(table(b.kind)).delete().eq("id", b.id).eq("crew_id", me.crew_id).select("id"));
  if (!del.length) return notFound();
  return json({ crew: await crewDTO(me.crew_id, me.language) });
});
