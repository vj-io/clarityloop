"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the effect only starts a fetch on mount; state is set when it resolves */
// Printable safety briefing record: who was briefed on which points, each worker's words, what was understood, when.
// Screen look is the app's; print look is a plain white report (same rules as /record).
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MarkIcon, Pill, Screen } from "@/components/ui";
import { AppHeader } from "@/components/shell/AppHeader";
import { Btn, ErrorBox, PageLoading, errMsg } from "@/components/shell/Common";
import { useRequireMe } from "@/components/shell/guard";
import { when, whenFull } from "@/components/biz/fmt";
import { PointList } from "@/components/chat/briefing";
import { api } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import { LANG_NAME, type BriefingDTO, type BriefingReplyDTO, type Lang } from "@/lib/types";

const PRINT_CSS = `
@media print {
  @page { margin: 14mm 12mm 18mm; }
  html, body { background: #fff !important; background-image: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .rec * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rec .doodle { box-shadow: none !important; border-radius: 6px !important; border-width: 1.5px !important; background: #fff !important; }
  .rec .keep { break-inside: avoid; page-break-inside: avoid; }
  .rec h2 { break-after: avoid; page-break-after: avoid; }
  .rec-foot { margin-top: 8mm; border-top: 1px solid #000; padding-top: 3mm; font-size: 9pt; text-align: center; break-inside: avoid; }
}`;

function Worker({ r, b, t, lang }: { r: BriefingReplyDTO; b: BriefingDTO; t: T; lang: Lang }) {
  const label = (id: string) => b.points.find((p) => p.id === id)?.label ?? b.other_points.find((p) => p.id === id)?.label ?? "";
  const ok = r.state === "understood";
  return (
    <div className="doodle keep mt-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 font-display text-xl font-extrabold">{r.worker.name}<Pill tint="pen">{LANG_NAME[r.worker.language]}</Pill></p>
        <p className={`flex items-center gap-1 font-display text-lg font-extrabold ${ok ? "text-[#0f6b31]" : r.attempts.length ? "text-warn" : "text-muted"}`}>
          <MarkIcon mark={ok ? "match" : "unclear"} size={22} />
          {ok ? t("s.rec.understoodAt", { time: whenFull(r.understood_at!, lang) }) : r.attempts.length ? t("s.res.some", { n: r.said.length, total: b.points.length }) : t("s.rec.noReply")}
        </p>
      </div>
      <PointList points={b.points} marks={r.attempts.some((a) => !a.unreadable) ? new Set(r.said) : null} t={t} big={false} />
      {r.attempts.map((a, i) => (
        <div key={a.at} className="keep mt-3 border-t-2 border-dashed border-ink/30 pt-2">
          <p className="font-display text-base font-extrabold">{t("s.rec.reply", { n: i + 1, time: when(a.at, lang) })}</p>
          <blockquote lang={a.language} className="mt-1 border-l-4 border-ink pl-3 text-lg">{a.text}</blockquote>
          {a.unreadable ? <p className="mt-1 font-semibold text-warn">{t("s.res.unreadable")}</p> : <>
            {a.gloss && <p className="mt-1"><span className="font-hand text-lg text-muted">{t("s.res.understood")}: </span>{a.gloss}</p>}
            <p><span className="font-hand text-lg text-muted">{t("s.rec.mentioned")}: </span>{a.said_point_ids.length ? a.said_point_ids.map(label).join(" · ") : t("s.rec.none")}</p>
          </>}
        </div>
      ))}
    </div>
  );
}

export default function BriefingRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { me, t } = useRequireMe();
  const [b, setB] = useState<BriefingDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setB((await api("GET /api/briefings/:id", undefined, { id })).briefing); } catch (e) { setErr(errMsg(e, t)); }
  }, [id, t]);
  useEffect(() => { if (me) void load(); }, [me, load]);
  const lang = me?.language ?? "en";
  const [printedAt] = useState(() => Date.now());

  return (
    <div className="rec flex flex-1 flex-col">
      <style>{PRINT_CSS}</style>
      <div className="print:hidden"><AppHeader title={t("s.rec.title")} back={b ? `/c/${b.conversation_id}` : "/inbox"} /></div>
      <Screen wide>
        {!me || (!b && !err) ? <PageLoading t={t} /> : err ? <ErrorBox message={err} onRetry={load} t={t} /> : b && (
          <div className="[overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-3xl font-extrabold leading-tight">{t("s.rec.title")}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-base">
                  <span>{t("s.rec.sent", { time: whenFull(b.created_at, lang), sup: b.supervisor.name })}</span>
                  {b.is_sandbox && <Pill tint="warn">{t("b.rec.sandbox")}</Pill>}
                </p>
                <p className="mt-1 font-display text-xl font-extrabold">{t("s.roll.progress", { n: b.progress.understood, total: b.progress.total })}</p>
              </div>
              <Btn tone="hi" type="button" onClick={() => window.print()} className="print:hidden">{t("s.rec.print")}</Btn>
            </div>
            <section className="keep mt-6" aria-labelledby="br-points">
              <h2 id="br-points" className="font-display text-2xl font-extrabold leading-tight">{t("s.rec.points")}</h2>
              <PointList points={b.points} t={t} big={false} />
              {(b.place || b.note) && (
                <dl className="doodle mt-3 space-y-1 p-3">
                  {b.place && <div className="flex flex-wrap gap-x-2"><dt className="font-hand text-lg text-muted">{t("s.form.place")}</dt><dd className="font-semibold">{b.place}</dd></div>}
                  {b.note && <div className="flex flex-wrap gap-x-2"><dt className="font-hand text-lg text-muted">{t("s.form.note")}</dt><dd className="font-semibold">{b.note}</dd></div>}
                </dl>
              )}
            </section>
            <section className="mt-6" aria-labelledby="br-workers">
              <h2 id="br-workers" className="font-display text-2xl font-extrabold leading-tight">{t("s.rec.workers")}</h2>
              {b.replies.length === 0 && <p className="mt-2 font-hand text-lg text-muted">{t("s.roll.noWorkers")}</p>}
              {b.replies.map((r) => <Worker key={r.worker.id} r={r} b={b} t={t} lang={lang} />)}
            </section>
            <p className="mt-6 text-sm text-muted print:hidden">{t("s.extra")}</p>
          </div>
        )}
      </Screen>
      {b && <p className="rec-foot hidden print:block">{t("s.rec.footer", { date: whenFull(printedAt, lang) })}</p>}
    </div>
  );
}
