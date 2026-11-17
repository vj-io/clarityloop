import { CARD } from "@/lib/types";
import { requireMe } from "@/lib/server/auth";
import { postCard } from "@/lib/server/cards";
import { fail, forbidden, idParam, json, route } from "@/lib/server/http";
import { loadTask, setState, taskDTO } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** FR-20: the task's supervisor marks an understood task done. Idempotent. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req, "supervisor");
  const { task, conv } = await loadTask(await idParam(ctx), me);
  if (task.supervisor_id !== me.id) return forbidden();
  if (task.state !== "done") {
    if (task.state !== "understood") return fail(409, "conflict", "task is not understood yet");
    await setState(task, "done", me.id, "done", {}, { done_at: new Date().toISOString() });
    await postCard(conv.id, `${CARD.STATE}${task.id}:done`);
  }
  return json({ task: await taskDTO(task, conv, me) });
});
