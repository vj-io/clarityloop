"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the effect only starts a fetch on mount; state is set when it resolves */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Pill, Screen } from "@/components/ui";
import { AppHeader } from "@/components/shell/AppHeader";
import { ErrorBox, LinkButton, PageLoading, errMsg } from "@/components/shell/Common";
import { useRequireMe } from "@/components/shell/guard";
import { TaskStatePill } from "@/components/shell/TaskState";
import { api, supabase } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import { LANG_NAME, type BriefingInsights, type InsightsDTO, type Lang } from "@/lib/types";
import { HBar, TrendChart } from "./Charts";
import { when } from "./fmt";

/** English/Tamil singular when the count is exactly 1 (keys end in "1"). */
const one = (t: T, key: string, total: number, vars: Record<string, number>) => t(total === 1 ? `${key}1` : key, vars);
const pctText = (n: number | null) => (n == null ? "" : `${n}%`);

function Tile({ k, label, value, sub, tint }: { k: string; label: string; value: string; sub?: string; tint?: boolean }) {
  return (
    <div className={`doodle p-3 ${tint ? "bg-hi!" : ""}`}>
      <p className="font-hand text-lg leading-tight">{label}</p>
      <p data-k={k} className="font-mono text-4xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-sm leading-snug text-muted" style={tint ? { color: "var(--ink)" } : undefined}>{sub}</p>}
    </div>
  );
}

function Empty({ t }: { t: T }) {
  return (
    <Card className="mt-6 flex flex-col items-center gap-3 text-center">
      <svg width="132" height="104" viewBox="0 0 132 104" fill="none" aria-hidden="true">
        <path d="M14 88 H118" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <rect x="24" y="58" width="20" height="30" rx="4" stroke="var(--ink)" strokeWidth="4" strokeDasharray="1 9" strokeLinecap="round" />
        <rect x="56" y="38" width="20" height="50" rx="4" stroke="var(--ink)" strokeWidth="4" strokeDasharray="1 9" strokeLinecap="round" />
        <rect x="88" y="18" width="20" height="70" rx="4" stroke="var(--ink)" strokeWidth="4" strokeDasharray="1 9" strokeLinecap="round" />
        <path d="M30 40 C50 24, 64 30, 84 10 M72 8 L86 9 L84 22" stroke="var(--pen)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="font-display text-xl font-extrabold">{t("b.in.emptyTitle")}</p>
      <LinkButton href="/inbox" tone="hi">{t("b.in.emptyBtn")}</LinkButton>
    </Card>
  );
}

function Fields({ d, t }: { d: InsightsDTO; t: T }) {
  const miss = (f: InsightsDTO["fields"][number]) => f.mismatch + f.unclear;
  const top = Math.max(...d.fields.map(miss));
  const share = (n: number, total: number) => (total ? (100 * n) / total : 0);
  return (
    <section className="mt-8" aria-labelledby="in-fields">
      <h2 id="in-fields" className="font-display text-2xl font-extrabold leading-tight">{t("b.in.fieldsTitle")}</h2>
      <p className="mb-3 text-base text-muted">{t("b.in.fieldsSub")}</p>
      <Card>
        <ul className="space-y-4">
          {d.fields.map((f) => (
            <li key={f.field} data-field={f.field}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={`font-display text-lg font-extrabold ${top > 0 && miss(f) === top ? "hl" : ""}`}>{t(`b.f.${f.field}`)}</span>
                <span className="font-mono text-sm">{one(t, "b.in.fieldsOf", f.checked, { n: miss(f), total: f.checked })}</span>
              </div>
              <HBar hi={top > 0 && miss(f) === top} parts={[{ pct: share(f.mismatch, f.checked), color: "var(--bad)" }, { pct: share(f.unclear, f.checked), color: "var(--warn)" }]} />
              <p className="flex flex-wrap gap-x-4 text-sm font-semibold">
                <span className="text-bad">{t("mark.mismatch")}: <span className="font-mono">{f.mismatch}</span></span>
                <span className="text-warn">{t("mark.unclear")}: <span className="font-mono">{f.unclear}</span></span>
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function Languages({ d, t }: { d: InsightsDTO; t: T }) {
  return (
    <section className="mt-8" aria-labelledby="in-lang">
      <h2 id="in-lang" className="font-display text-2xl font-extrabold leading-tight">{t("b.in.langTitle")}</h2>
      <p className="mb-3 text-base text-muted">{t("b.in.langSub")}</p>
      <Card>
        <ul className="space-y-4">
          {d.languages.map((l) => (
            <li key={l.language} data-lang={l.language}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-display text-lg font-extrabold">{LANG_NAME[l.language]}</span>
                <span className="font-mono text-sm">{one(t, "b.in.tasksN", l.tasks, { n: l.tasks })} · {pctText(l.retried_pct)}</span>
              </div>
              <HBar parts={[{ pct: l.retried_pct ?? 0, color: "var(--pen)" }]} />
              <p className="text-sm font-semibold text-pen">{t("b.in.retriedN", { n: l.retried })}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function Workers({ d, t, meName }: { d: InsightsDTO; t: T; meName: string }) {
  if (d.workers.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="in-work">
      <h2 id="in-work" className="font-display text-2xl font-extrabold leading-tight">{t("b.in.workTitle")}</h2>
      <p className="mb-2 text-base text-muted">{t("b.in.workSub")}</p>
      <Card>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b-[3px] border-ink font-hand text-lg">
              <th scope="col" className="py-1 pr-2 font-normal">{t("b.in.colPair")}</th>
              <th scope="col" className="[overflow-wrap:normal] px-2 py-1 text-right font-normal">{t("b.in.colTasks")}</th>
              <th scope="col" className="[overflow-wrap:normal] py-1 pl-2 text-right font-normal">{t("b.in.colRetry")}</th>
            </tr>
          </thead>
          <tbody>
            {d.workers.map((w) => (
              <tr key={w.id} className="border-b-2 border-dashed border-ink/40 last:border-0" data-worker={w.id}>
                <th scope="row" className="py-2 pr-2 font-normal leading-tight">
                  <span className="block font-semibold">{meName} → {w.name}</span>
                  {w.language && <span className="text-sm text-muted">{LANG_NAME[w.language]}</span>}
                </th>
                <td className="px-2 py-2 text-right font-mono">{w.tasks}</td>
                <td className="py-2 pl-2 text-right font-mono">{w.retried}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p role="note" className="doodle doodle-flat mt-3 bg-pen-soft! px-3 py-2 font-hand text-lg leading-snug">{t("b.in.noWatch")}</p>
    </section>
  );
}

function Trend({ d, t, lang }: { d: InsightsDTO; t: T; lang: Lang }) {
  return (
    <section className="mt-8" aria-labelledby="in-trend">
      <h2 id="in-trend" className="font-display text-2xl font-extrabold leading-tight">{t("b.in.trendTitle")}</h2>
      <Card className="mt-2">
        <TrendChart days={d.trend} lang={lang} label={t("b.in.trendAria")} />
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
          <li className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-4 w-4 rounded border-[3px] border-ink bg-card" />{t("b.in.trendSent")}: <span className="font-mono">{d.trend.reduce((a, x) => a + x.sent, 0)}</span></li>
          <li className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-4 w-4 rounded border-[3px] border-ink bg-hi" />{t("b.in.trendFirst")}: <span className="font-mono">{d.trend.reduce((a, x) => a + x.first_try, 0)}</span></li>
        </ul>
      </Card>
    </section>
  );
}

function Recent({ d, t, lang }: { d: InsightsDTO; t: T; lang: Lang }) {
  return (
    <section className="mt-8" aria-labelledby="in-recent">
      <h2 id="in-recent" className="font-display text-2xl font-extrabold leading-tight">{t("b.in.recentTitle")}</h2>
      <ul className="mt-2 space-y-3">
        {d.recent.map((r) => (
          <li key={r.id}>
            <Link href={`/record/${r.id}`} aria-label={t("b.in.openRecord", { what: r.object })} className="doodle flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3">
              <span className="min-w-0">
                <span className="block truncate font-display text-lg font-extrabold leading-tight">{r.object}</span>
                <span className="block text-sm text-muted">{r.worker} · {when(r.created_at, lang)} · {t("b.in.tries", { n: r.restatements })}</span>
              </span>
              <span className="flex items-center gap-2"><TaskStatePill state={r.state} t={t} /><span className="font-semibold text-pen underline underline-offset-4">{t("b.in.record")}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Briefings({ b, t }: { b: BriefingInsights; t: T }) {
  return (
    <section className="mt-8" aria-labelledby="in-brief">
      <h2 id="in-brief" className="font-display text-2xl font-extrabold leading-tight">{t("b.br.title")}</h2>
      <p className="mb-3 text-base text-muted">{t("b.br.sub")}</p>
      {b.sent === 0 ? <Card><p data-k="br-empty" className="font-hand text-xl leading-snug">{t("b.br.empty")}</p></Card> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile k="br-sent" label={t("b.br.sent")} value={String(b.sent)} />
            <Tile k="br-replied" label={t("b.br.replied")} value={String(b.replied)} sub={t("b.br.ofExpected", { n: b.replied, total: b.expected })} />
            <Tile k="br-first" label={t("b.br.first")} value={String(b.first_try)} sub={t("b.br.ofReplied", { n: b.first_try, total: b.replied })} tint />
          </div>
          <Card className="mt-4">
            <h3 className="font-display text-lg font-extrabold leading-tight">{t("b.br.missedTitle")}</h3>
            <p className="mb-3 text-base text-muted">{t("b.br.missedSub")}</p>
            {b.missed.length === 0 ? <p className="font-hand text-lg">{t(b.replied ? "b.br.noneMissed" : "b.br.noReplies")}</p> : (
              <ul className="space-y-4">
                {b.missed.map((m) => (
                  <li key={m.id} data-point={m.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold">{m.label}</span>
                      <span className="font-mono text-sm">{t("b.br.missedOf", { n: m.missed, total: m.of })}</span>
                    </div>
                    <HBar parts={[{ pct: (100 * m.missed) / m.of, color: "var(--warn)" }]} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </section>
  );
}

/** The export needs the Bearer token, so it is fetched and saved from the page instead of being a plain link. */
function DownloadCsv({ t }: { t: T }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    setBusy(true); setFailed(false);
    try {
      const { data } = await supabase().auth.getSession();
      const res = await fetch("/api/insights/export", { headers: { Authorization: `Bearer ${data.session?.access_token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = "clarityloop-tasks.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { setFailed(true); }
    setBusy(false);
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button tone="ghost" onClick={download} disabled={busy} data-k="csv">{t("b.in.csv")}</Button>
      <p className="text-sm text-muted">{t("b.in.csvHint")}</p>
      {failed && <p role="alert" className="w-full font-semibold text-bad">{t("b.in.csvErr")}</p>}
    </div>
  );
}

export function InsightsView() {
  const { me, t } = useRequireMe({ role: "supervisor" });
  const [d, setD] = useState<InsightsDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setD(await api("GET /api/insights")); } catch (e) { setErr(errMsg(e, t)); }
  }, [t]);
  useEffect(() => { if (me) void load(); }, [me, load]);

  const lang = me?.language ?? "en";
  const s = d?.totals;
  return (
    <>
      <AppHeader title={t("b.nav.insights")} />
      <Screen wide>
        {!me || (!d && !err) ? <PageLoading t={t} /> : err ? <ErrorBox message={err} onRetry={load} t={t} /> : d && s && (
          <div className="[overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-display text-3xl font-extrabold leading-tight">{t("b.in.title")}</h2>
              {d.crew.is_sandbox && <Pill tint="warn">{t("b.in.demo")}</Pill>}
            </div>
            <p className="mt-1 text-base text-muted">{d.crew.site_name} · {t(d.crew.is_sandbox ? "b.in.subDemo" : "b.in.sub")}</p>
            <p className="text-base text-muted">{t("b.in.crewNote")}</p>
            {s.sent === 0 ? <Empty t={t} /> : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Tile k="sent" label={t("b.in.sent")} value={String(s.sent)} />
                  <Tile k="restated" label={t("b.in.restated")} value={pctText(s.restated_pct)} sub={one(t, "b.in.ofTasks", s.sent, { n: s.restated, total: s.sent })} />
                  <Tile k="understood" label={t("b.in.understood")} value={pctText(s.understood_pct)} sub={one(t, "b.in.ofTasks", s.sent, { n: s.understood, total: s.sent })} />
                  <Tile k="median" label={t("b.in.median")} value={s.median_minutes_to_understood == null ? "-" : t("b.in.min", { n: s.median_minutes_to_understood })} sub={s.median_minutes_to_understood == null ? t("b.in.notYet") : undefined} />
                </div>
                <div className="doodle mt-4 bg-hi! p-4">
                  <p className="font-display text-lg font-extrabold leading-tight">{t("b.in.caught")}</p>
                  <p data-k="caught" className="font-mono text-5xl font-bold leading-tight">{s.caught}</p>
                  <p className="text-base leading-snug">{one(t, "b.in.caughtSub", s.sent, { n: s.caught, total: s.sent })}</p>
                </div>
                <div className="md:grid md:grid-cols-2 md:gap-6">
                  <Fields d={d} t={t} />
                  <div>
                    <Languages d={d} t={t} />
                    <Workers d={d} t={t} meName={me.display_name} />
                  </div>
                </div>
                <Trend d={d} t={t} lang={lang} />
                <Recent d={d} t={t} lang={lang} />
                <DownloadCsv t={t} />
              </>
            )}
            {d.briefings && <Briefings b={d.briefings} t={t} />}
            <details className="mt-8 rounded-xl border-2 border-dashed border-ink bg-card p-3">
              <summary className="min-h-12 cursor-pointer py-3 font-display text-lg font-extrabold">{t("b.in.howTitle")}</summary>
              <ul className="list-disc space-y-1 pl-5">{[1, 2, 3, 4, 5, 6].map((n) => <li key={n}>{t(`b.in.how${n}`)}</li>)}</ul>
            </details>
          </div>
        )}
      </Screen>
    </>
  );
}
