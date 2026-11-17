import { requireMe } from "@/lib/server/auth";
import { idParam, json, route } from "@/lib/server/http";
import { loadTask, taskDTO } from "@/lib/server/tasks";

export const runtime = "nodejs";

export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req);
  const { task, conv } = await loadTask(await idParam(ctx), me);
  return json({ task: await taskDTO(task, conv, me) });
});
