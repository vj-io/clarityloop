// "Send again": the supervisor's latest distinct tasks. Pure, no I/O (unit-tested in src/lib/recent-tasks.test.ts).
import type { RecentTask } from "./types.ts";

/**
 * `rows` newest first. Distinct by action, object (any case), place, quantity and unit, so a crew task
 * (one copy per worker) shows once. Sample-history rows are left out unless nothing else exists.
 */
export function recentDistinct(rows: RecentTask[], n = 5): RecentTask[] {
  const seen = new Set<string>();
  const out = rows.filter((r) => {
    const k = [r.action_id, r.object_text.trim().toLowerCase(), r.place_id, r.quantity, r.unit?.trim().toLowerCase() ?? ""].join("|");
    return !seen.has(k) && seen.add(k);
  });
  const own = out.filter((r) => !r.sample);
  return (own.length ? own : out).slice(0, n);
}
