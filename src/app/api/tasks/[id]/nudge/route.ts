import { requireMe } from "@/lib/server/auth";
import { fail, forbidden, idParam, json, route } from "@/lib/server/http";
import { NUDGE_STATES } from "@/lib/types";
import { loadTask, nudge, taskDTO } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** The task's supervisor reminds the worker to say the task back. 429 within 10 minutes of the last reminder. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req, "supervisor");
  const { task, conv } = await loadTask(await idParam(ctx), me);
  if (task.supervisor_id !== me.id) return forbidden();
  if (!NUDGE_STATES.includes(task.state)) return fail(409, "conflict", "this task needs no reminder now");
  const { wait, posted } = await nudge(task, conv, me.id);
  if (wait) return json({ error: "rate_limited", message: `next reminder in ${wait} s`, wait_seconds: wait }, 429);
  const [dto] = await Promise.all([taskDTO(task, conv, me), posted]);
  return json({ task: dto });
});
