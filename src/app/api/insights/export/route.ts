import { makeT } from "@/lib/i18n";
import { istStamp, toCsv } from "@/lib/insights-csv";
import { requireMe } from "@/lib/server/auth";
import { route } from "@/lib/server/http";
import { loadExport } from "@/lib/server/insights";

export const runtime = "nodejs";

const COLS = ["created", "worker", "action", "object", "place", "due", "qty", "unit", "state", "sayBacks", "firstMatch", "wrongFirst", "understood", "done", "sample"];

/** The crew's task records as CSV. Supervisor of the crew only (same guard as /api/insights); read-only. */
export const GET = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const t = makeT(me.language);
  const yn = (v: boolean | null) => (v == null ? "" : t(v ? "b.csv.yes" : "b.csv.no"));
  const rows = (await loadExport(me)).map((r) => [
    istStamp(r.created_at), r.worker, r.action, r.object, r.place, r.due_time, r.quantity, r.unit, t(`state.${r.state}`),
    r.say_backs, yn(r.first_match), r.wrong_first.map((f) => t(`b.f.${f}`)).join(", "), istStamp(r.understood_at), istStamp(r.done_at), yn(r.is_sandbox),
  ]);
  return new Response(toCsv([COLS.map((c) => t(`b.csv.${c}`)), ...rows]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="clarityloop-tasks.csv"', "Cache-Control": "no-store" },
  });
});
