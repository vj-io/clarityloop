import { CARD } from "@/lib/types";
import { requireMe } from "@/lib/server/auth";
import { postCard } from "@/lib/server/cards";
import { audit, db, ok } from "@/lib/server/db";
import { fail, forbidden, idParam, json, route } from "@/lib/server/http";
import { loadTask, setState, taskDTO } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** FR-17: both people confirm once every field matches or was accepted. Idempotent. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req);
  const { task, conv } = await loadTask(await idParam(ctx), me);
  if (me.id !== task.supervisor_id && me.id !== task.worker_id) return forbidden();
  if (task.state === "understood" || task.state === "done") return json({ task: await taskDTO(task, conv, me) });
  if (task.state !== "all_match") return fail(409, "blocked");

  const ins = ok(await db().from("task_confirmations").upsert({ task_id: task.id, profile_id: me.id }, { ignoreDuplicates: true }).select("profile_id")) as unknown[];
  if (ins.length) {
    const all = ok(await db().from("task_confirmations").select("profile_id").eq("task_id", task.id)) as { profile_id: string }[];
    const ids = new Set(all.map((c) => c.profile_id));
    if (ids.has(task.supervisor_id) && ids.has(task.worker_id)) {
      // a say-back that arrived while this request ran has already moved the task on: do not overwrite it
      const still = ok(await db().from("tasks").select("state").eq("id", task.id).single()) as { state: string };
      if (still.state !== "all_match") return fail(409, "blocked");
      await setState(task, "understood", me.id, "confirmed", { both: true }, { understood_at: new Date().toISOString() });
      await postCard(conv.id, `${CARD.STATE}${task.id}:understood`);
    } else {
      await audit(task.id, me.id, "confirmed", { both: false });
      await postCard(conv.id, `${CARD.STATE}${task.id}:confirmed`);
    }
  }
  return json({ task: await taskDTO(task, conv, me) });
});
