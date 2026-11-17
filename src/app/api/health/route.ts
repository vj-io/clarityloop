import type { HealthDTO } from "@/lib/types";
import { AI_MODEL, aiReady } from "@/lib/server/ai";
import { flushOutbox } from "@/lib/server/cards";
import { db } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { nexconnConfigured, transport } from "@/lib/server/nexconn";

export const runtime = "nodejs";

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// Public, but carries no secrets or personal data: counts, timings and error codes only.
export const GET = route(async () => {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [ready, ev, pendingAfterFlush] = await Promise.all([
    aiReady(),
    db().from("health_events").select("kind, ok, code, ms, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    flushOutbox().catch(() => null),
  ]);
  const rows = (ev.data ?? []) as { kind: string; ok: boolean; code: string | null; ms: number | null; created_at: string }[];
  const timings: HealthDTO["timings"] = {};
  for (const kind of new Set(rows.map((r) => r.kind))) {
    const of = rows.filter((r) => r.kind === kind);
    timings[kind] = { n: of.length, median_ms: median(of.filter((r) => r.ok && r.ms != null).map((r) => r.ms!)), errors: of.filter((r) => !r.ok).length };
  }
  const pending = await db().from("card_outbox").select("id", { count: "exact", head: true }).is("sent_at", null);
  const res: HealthDTO = {
    transport: transport(), nexconn_configured: nexconnConfigured(), ai_ready: ready, ai_model: AI_MODEL,
    db_ok: !ev.error && !pending.error, pending_cards: pending.count ?? pendingAfterFlush ?? 0,
    timings,
    last_errors: rows.filter((r) => !r.ok).slice(0, 10).map((r) => ({ kind: r.kind, code: r.code, at: r.created_at })),
  };
  return json(res);
});
