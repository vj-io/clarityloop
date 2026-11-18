import { z } from "zod";
import { CARD, FIELDS } from "@/lib/types";
import { overallOf } from "@/lib/compare";
import { requireMe } from "@/lib/server/auth";
import { postCard } from "@/lib/server/cards";
import { db, ok } from "@/lib/server/db";
import { body, fail, forbidden, idParam, json, route } from "@/lib/server/http";
import { latestCheck, loadTask, setState, taskDTO } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** FR-16: the task's supervisor accepts the worker's value for an unclear field of the latest check. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req, "supervisor");
  const { task, conv } = await loadTask(await idParam(ctx), me);
  if (task.supervisor_id !== me.id) return forbidden();
  const { field } = await body(req, z.object({ field: z.enum(FIELDS) }));
  if (task.state === "understood" || task.state === "done") return fail(409, "conflict", "task already understood");
  const check = await latestCheck(task.id);
  const mark = check?.field_marks[field];
  if (!check || !mark || mark.mark !== "unclear" || mark.accepted) return fail(409, "conflict", "only an unclear field of the latest check can be accepted");

  // Nothing to accept when the worker did not say this part at all: they have to say it back.
  if (mark.worker == null) return fail(409, "conflict", "the worker did not say this part");

  const acc = await db().from("field_acceptances").insert({ check_id: check.id, field, accepted_by: me.id });
  if (acc.error) return acc.error.code === "23505" ? fail(409, "conflict") : fail(500, "internal");
  const field_marks = { ...check.field_marks, [field]: { ...mark, accepted: true } };
  const overall = overallOf(field_marks);
  ok(await db().from("checks").update({ field_marks, overall }).eq("id", check.id));
  Object.assign(check, { field_marks, overall });
  await setState(task, overall, me.id, "field_accepted", { check_id: check.id, field, accepted_by: me.id, at: new Date().toISOString() });
  await postCard(conv.id, CARD.CHECK + check.id);
  return json({ task: await taskDTO(task, conv, me, check) });
});
