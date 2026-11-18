"use client";
/* eslint-disable react-hooks/set-state-in-effect -- these effects only start a fetch on mount; state is set when it resolves */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/session";
import type { HealthDTO } from "@/lib/types";
import { Card, MarkIcon, Screen } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { ErrorBox, PageLoading, PublicHeader, errMsg } from "@/components/shell/Common";

function Row({ label, ok, value }: { label: string; ok?: boolean; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="font-hand text-lg">{label}</span>
      <span className="flex items-center gap-2 text-right font-mono text-base font-bold">
        {ok !== undefined && <MarkIcon mark={ok ? "match" : "mismatch"} size={20} />}{value}
      </span>
    </li>
  );
}

/** Signed-out visitors (and workers) get the short status only: no model name, timings or errors. */
type Health = Omit<HealthDTO, "ai_model" | "timings" | "last_errors"> & Partial<Pick<HealthDTO, "ai_model" | "timings" | "last_errors">>;

function Health() {
  const debug = useSearchParams().get("debug") === "1"; // raw error rows are for the team only
  const { lang, setLang, t } = usePublicLang();
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setH(await api("GET /api/health")); } catch (e) { setErr(errMsg(e, t)); }
  }, [t]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const yn = (b: boolean) => t(b ? "health.yes" : "health.no");

  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      <Screen>
        <h1 className="font-display text-3xl font-extrabold">{t("health.title")}</h1>
        <p className="font-hand text-lg text-muted">{t("health.sub")}</p>
        <div className="mt-4 space-y-5">
          {err && <ErrorBox message={err} onRetry={load} t={t} />}
          {!h && !err && <PageLoading t={t} />}
          {h && (
            <>
              <Card>
                <ul className="divide-y-2 divide-dashed divide-ink/30">
                  <Row label={t("health.transport")} value={h.transport} />
                  <Row label={t("health.nexconn")} ok={h.nexconn_configured} value={yn(h.nexconn_configured)} />
                  <Row label={t("health.ai")} ok={h.ai_ready} value={h.ai_model ? `${yn(h.ai_ready)} · ${h.ai_model}` : yn(h.ai_ready)} />
                  <Row label={t("health.db")} ok={h.db_ok} value={yn(h.db_ok)} />
                  <Row label={t("health.pending")} ok={h.pending_cards === 0} value={String(h.pending_cards)} />
                </ul>
              </Card>
              {!h.timings && <p className="font-hand text-lg text-muted">{t("health.signin")} <Link href="/login" className="font-semibold text-pen underline underline-offset-4">{t("login.title")}</Link></p>}
              {h.timings && (
              <Card>
                <h2 className="font-display text-xl font-extrabold">{t("health.timings")}</h2>
                {Object.keys(h.timings).length === 0 ? <p className="mt-1 text-muted">{t("health.none")}</p> : (
                  <table className="mt-2 w-full text-left text-base">
                    <thead><tr className="font-hand text-lg"><th className="pr-2">{t("health.kind")}</th><th className="pr-2 text-right">n</th><th className="pr-2 text-right">{t("health.median")}</th><th className="text-right">{t("health.errors")}</th></tr></thead>
                    <tbody className="font-mono">
                      {Object.entries(h.timings).map(([k, v]) => (
                        <tr key={k} className="border-t-2 border-dashed border-ink/30"><td className="break-all pr-2">{k}</td><td className="pr-2 text-right">{v.n}</td><td className="pr-2 text-right">{v.median_ms == null ? "-" : `${Math.round(v.median_ms)} ms`}</td><td className="text-right">{v.errors}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
              )}
              {debug && h.last_errors && (
              <Card>
                <h2 className="font-display text-xl font-extrabold">{t("health.lastErrors")}</h2>
                {h.last_errors.length === 0 ? <p className="mt-1 text-muted">{t("health.none")}</p> : (
                  <ul className="mt-2 space-y-1 font-mono text-sm">
                    {h.last_errors.map((e, i) => <li key={i} className="break-all">{new Date(e.at).toLocaleString()} · {e.kind} · {e.code ?? "-"}</li>)}
                  </ul>
                )}
              </Card>
              )}
            </>
          )}
          <p className="flex flex-wrap gap-x-6">
            {h && <button type="button" onClick={load} className="inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4">{t("health.refresh")}</button>}
            <Link href="/" className="inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4">{t("judge.home")}</Link>
          </p>
        </div>
      </Screen>
    </>
  );
}

export default function HealthPage() {
  return <Suspense><Health /></Suspense>;
}
