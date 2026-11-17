import { requireMe } from "@/lib/server/auth";
import { forbidden, idParam, json, route } from "@/lib/server/http";
import { loadTask, markSeen } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** The assigned worker had the task card on screen. "Seen" is recorded so the supervisor can tell it from "understood". */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req, "worker");
  const { task, conv } = await loadTask(await idParam(ctx), me);
  if (task.worker_id !== me.id) return forbidden();
  await markSeen(task, conv);
  return json({ ok: true });
});
