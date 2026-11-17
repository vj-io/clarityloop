import { objectAliases } from "@/lib/server/ai";
import { z } from "zod";
import { CARD } from "@/lib/types";
import { requireMe } from "@/lib/server/auth";
import { postCard } from "@/lib/server/cards";
import { memberConversation, type ConvRow } from "@/lib/server/conversations";
import { crewLists } from "@/lib/server/crew";
import { audit, db, ok } from "@/lib/server/db";
import { body, fail, forbidden, json, route } from "@/lib/server/http";
import { i18nAll, taskDTO, type TaskRow } from "@/lib/server/tasks";

export const runtime = "nodejs";

const Body = z.object({
  conversation_id: z.uuid(),
  action_id: z.uuid(),
  object_text: z.string().trim().min(1).max(80),
  place_id: z.uuid(),
  due_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quantity: z.number().nonnegative().max(1_000_000).nullish(),
  unit: z.string().trim().min(1).max(20).nullish(),
  note: z.string().trim().max(280).nullish(),
});

/** FR-10/11: the supervisor of a conversation sends a task; the task card is posted. */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const b = await body(req, Body);
  const conv = await memberConversation(b.conversation_id, me.id);
  if (conv.supervisor_id !== me.id) return forbidden();
  if (conv.kind !== "pair") return fail(400, "invalid", "a crew channel takes crew tasks: POST /api/broadcasts");
  const lists = await crewLists(conv.crew_id);
  if (!lists.actions.some((a) => a.id === b.action_id) || !lists.places.some((p) => p.id === b.place_id)) return fail(400, "invalid", "action or place is not in this crew's lists");

  const note = b.note || null;
  const object_i18n = await i18nAll(b.object_text, me.language, lists);
  const [object_aliases, note_i18n, crew] = await Promise.all([
    objectAliases(object_i18n.en),
    note ? i18nAll(note, me.language, lists) : Promise.resolve({}),
    db().from("crews").select("is_sandbox").eq("id", conv.crew_id).single(),
  ]);
  const task = ok(await db().from("tasks").insert({
    conversation_id: conv.id, supervisor_id: me.id, worker_id: conv.worker_id,
    action_id: b.action_id, object_text: b.object_text, object_i18n, object_aliases, place_id: b.place_id, due_time: b.due_time,
    quantity: b.quantity ?? null, unit: b.quantity == null ? null : b.unit ?? null, note, note_i18n,
    state: "waiting", is_sandbox: (ok(crew) as { is_sandbox: boolean }).is_sandbox,
  }).select("*").single()) as TaskRow;
  await audit(task.id, me.id, "task_created", { to: "waiting" });
  await postCard(conv.id, CARD.TASK + task.id);
  return json({ task: await taskDTO(task, conv, me) });
});

/** Supervisor: all their tasks; worker: tasks assigned to them. Newest first. */
export const GET = route(async (req) => {
  const me = await requireMe(req);
  const tasks = ok(await db().from("tasks").select("*").eq(me.role === "supervisor" ? "supervisor_id" : "worker_id", me.id)
    .order("created_at", { ascending: false }).limit(100)) as TaskRow[];
  if (!tasks.length) return json({ tasks: [] });
  const convs = new Map((ok(await db().from("conversations").select("*").in("id", [...new Set(tasks.map((t) => t.conversation_id))])) as ConvRow[]).map((c) => [c.id, c]));
  // ponytail: one DTO build per task (a few queries each); paginate if task lists grow past ~100.
  return json({ tasks: await Promise.all(tasks.map((t) => taskDTO(t, convs.get(t.conversation_id)!, me))) });
});
