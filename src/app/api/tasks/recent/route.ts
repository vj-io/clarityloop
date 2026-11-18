import { recentDistinct } from "@/lib/recent-tasks";
import { requireMe } from "@/lib/server/auth";
import { db, ok } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import type { TaskRow } from "@/lib/server/tasks";

export const runtime = "nodejs";

/** "Send again": up to five distinct recent tasks this supervisor sent in their own crew. Derived from tasks; nothing is stored. */
export const GET = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return json({ recent: [] });
  // ponytail: looks at the latest 60 task rows (a crew task is one row per worker); raise if crews outgrow it
  const tasks = ok(await db().from("tasks").select("id, action_id, object_text, place_id, quantity, unit, conversations!inner(crew_id)")
    .eq("supervisor_id", me.id).eq("conversations.crew_id", me.crew_id).order("created_at", { ascending: false }).limit(60)) as
    Pick<TaskRow, "id" | "action_id" | "object_text" | "place_id" | "quantity" | "unit">[];
  // sandbox sample history was not sent by the visitor: its checks carry model_id "sample"
  const samples = new Set(!me.is_sandbox || !tasks.length ? [] :
    (ok(await db().from("checks").select("task_id").eq("model_id", "sample").in("task_id", tasks.map((t) => t.id))) as { task_id: string }[]).map((c) => c.task_id));
  return json({
    recent: recentDistinct(tasks.map((t) => ({
      action_id: t.action_id, object_text: t.object_text, place_id: t.place_id,
      quantity: t.quantity == null ? null : Number(t.quantity), unit: t.unit, sample: samples.has(t.id),
    }))),
  });
});
