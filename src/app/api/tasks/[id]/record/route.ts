import { requireMe } from "@/lib/server/auth";
import { idParam, json, route } from "@/lib/server/http";
import { loadRecord } from "@/lib/server/insights";
import { loadTask } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** The audit trail of one task. Members of its conversation only; read-only. */
export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req);
  const { task, conv } = await loadTask(await idParam(ctx), me);
  return json(await loadRecord(task, conv.crew_id, me));
});
