import { z } from "zod";
import { CARD, LANGS, type I18n } from "@/lib/types";
import { compareFields, overallOf } from "@/lib/compare";
import { AI_MODEL, extractFields, translateText } from "@/lib/server/ai";
import { requireMe } from "@/lib/server/auth";
import { postCard } from "@/lib/server/cards";
import { crewLists } from "@/lib/server/crew";
import { db, logHealth, ok } from "@/lib/server/db";
import { body, fail, forbidden, idParam, json, route } from "@/lib/server/http";
import { loadTask, setState, taskDTO, type CheckDbRow } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** FR-12..15: the assigned worker restates; AI extracts, code compares, the result card is posted. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req, "worker");
  const { task, conv } = await loadTask(await idParam(ctx), me);
  if (task.worker_id !== me.id) return forbidden();
  if (task.state === "understood" || task.state === "done") return fail(409, "conflict", "task already understood");
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(1000) }));

  const [ins, lists] = await Promise.all([
    db().from("restatements").insert({ task_id: task.id, worker_id: me.id, original_text: text, language: me.language }).select("id").single(),
    crewLists(conv.crew_id),
  ]);
  const rest = ok(ins) as { id: string };
  await setState(task, "checking", me.id, "restated", { restatement_id: rest.id });
  // The "checking" card goes out while extraction runs; it is awaited before the result card to keep order.
  const checkingCard = postCard(conv.id, `${CARD.STATE}${task.id}:checking`);

  const t0 = Date.now();
  const extracted = await extractFields(text, me.language, lists.actions, lists.places);
  const ms = Date.now() - t0;
  await logHealth("extract", extracted != null, extracted ? null : "unreadable", ms);

  const marks = compareFields({
    action_id: task.action_id, object_en: task.object_i18n.en ?? task.object_text, object_aliases: task.object_aliases ?? [], place_id: task.place_id,
    due_time: task.due_time, quantity: task.quantity == null ? null : Number(task.quantity), unit: task.unit,
  }, extracted);
  const overall = overallOf(marks);

  // "What we understood" in all three languages; English only if translation fails.
  const gloss: I18n = {};
  if (extracted) {
    gloss.en = extracted.gloss_en;
    await Promise.all(LANGS.filter((l) => l !== "en").map(async (l) => {
      try { gloss[l] = (await translateText(extracted.gloss_en, l, lists))?.text ?? extracted.gloss_en; } catch { /* English only */ }
    }));
  }
  const check = ok(await db().from("checks").insert({
    restatement_id: rest.id, task_id: task.id, extracted, field_marks: marks, overall, gloss, model_id: AI_MODEL, ms,
  }).select("*").single()) as CheckDbRow;

  const [del] = await Promise.all([
    db().from("task_confirmations").delete().eq("task_id", task.id), // a new check invalidates confirmations
    setState(task, overall, me.id, "checked", { check_id: check.id, overall, unreadable: extracted == null }),
    checkingCard,
  ]);
  ok(del);
  await postCard(conv.id, CARD.CHECK + check.id);

  const dto = await taskDTO(task, conv, me, check);
  return json({ task: dto, check: dto.latest_check });
});
