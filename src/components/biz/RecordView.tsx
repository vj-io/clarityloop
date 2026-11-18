"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the effect only starts a fetch on mount; state is set when it resolves */
import { useCallback, useEffect, useState } from "react";
import { MarkIcon, Pill, Screen } from "@/components/ui";
import { AppHeader } from "@/components/shell/AppHeader";
import { Btn, ErrorBox, PageLoading, errMsg } from "@/components/shell/Common";
import { useRequireMe } from "@/components/shell/guard";
import { TaskStatePill } from "@/components/shell/TaskState";
import { api } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import { LANG_NAME, type Lang, type RecordCheck, type RecordDTO } from "@/lib/types";
import { when, whenFull } from "./fmt";

// Screen look is the app's; print look is a plain white report: no chrome, no shadows, cards never split across pages.
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

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex flex-wrap gap-x-2"><dt className="font-hand text-lg text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
);

/** Human label for an audit event type; unknown types fall back to the words of the raw name. */
const evLabel = (type: string, t: T) => { const k = `b.ev.${type}`; const s = t(k); return s === k ? type.replace(/_/g, " ") : s; };

function Instruction({ r, t }: { r: RecordDTO; t: T }) {
  const k = r.task;
  const qty = k.quantity == null ? null : `${k.quantity}${k.unit ? ` ${k.unit}` : ""}`;
  const col = (title: string, v: RecordDTO["task"]["reader"], sub?: string) => (
    <div className="doodle keep p-3">
      <p className="font-display text-lg font-extrabold leading-tight">{title}</p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
      <dl className="mt-2 space-y-1">
        <Row k={t("b.f.action")} v={v.action} />
        <Row k={t("b.f.object")} v={v.object} />
        <Row k={t("b.f.place")} v={v.place} />
        <Row k={t("b.f.time")} v={k.due_time} />
        {qty && <Row k={t("b.f.quantity")} v={qty} />}
        {v.note && <Row k={t("b.rec.note")} v={v.note} />}
      </dl>
    </div>
  );
  return (
    <section className="mt-6" aria-labelledby="rec-instr">
      <h2 id="rec-instr" className="font-display text-2xl font-extrabold leading-tight">{t("b.rec.instructed")}</h2>
      <p className="mb-2 text-base">{t("b.rec.from")}: <b>{k.supervisor.name}</b> · {t("b.rec.to")}: <b>{k.worker.name}</b> ({LANG_NAME[k.worker.language]})</p>
      <div className="grid gap-4 md:grid-cols-2">
        {col(t("b.rec.inYours"), k.reader)}
        {col(t("b.rec.original", { name: k.supervisor.name }), k.original, LANG_NAME[k.original.language])}
      </div>
    </section>
  );
}

function Times({ r, t, lang }: { r: RecordDTO; t: T; lang: Lang }) {
  const k = r.task;
  const at = (v: string | null) => (v ? whenFull(v, lang) : t("b.rec.never"));
  return (
    <section className="mt-6 keep" aria-labelledby="rec-times">
      <h2 id="rec-times" className="font-display text-2xl font-extrabold leading-tight">{t("b.rec.times")}</h2>
      <dl className="doodle mt-2 space-y-1 p-3">
        <Row k={t("b.rec.created")} v={at(k.created_at)} />
        <Row k={t("b.rec.understood")} v={at(k.understood_at)} />
        <Row k={t("b.rec.done")} v={at(k.done_at)} />
      </dl>
    </section>
  );
}

function Check({ c, t, lang }: { c: RecordCheck; t: T; lang: Lang }) {
  const acc = new Map(c.accepted.map((a) => [a.field, a]));
  return (
    <div className="mt-3">
      <p className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold">
        {t("b.rec.check")} {c.overall === "all_match" && c.accepted.length > 0
          ? <Pill tint="ok"><MarkIcon mark="accepted" size={16} /><span className="text-[#0f6b31]">{t("c.check.accepted")}</span></Pill>
          : <TaskStatePill state={c.overall} t={t} />}<span className="font-hand text-base font-normal text-muted">{when(c.created_at, lang)}</span>
      </p>
      <ul className="mt-1 divide-y-2 divide-dashed divide-ink/30 rounded-lg border-2 border-ink bg-card">
        {c.rows.map((x) => (
          <li key={x.field} className="px-3 py-2 sm:grid sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_9rem] sm:items-start sm:gap-3">
            <span className="block font-display font-extrabold">{t(`b.f.${x.field}`)}</span>
            <span className="block"><span className="font-hand text-base text-muted sm:hidden">{t("b.rec.colSup")}: </span>{x.supervisor || "-"}</span>
            <span className="block"><span className="font-hand text-base text-muted sm:hidden">{t("b.rec.colWor")}: </span>{x.worker || "-"}</span>
            <span className="mt-1 block font-semibold sm:mt-0" style={{ color: x.mark === "match" ? "var(--ok)" : x.mark === "mismatch" ? "var(--bad)" : "var(--warn)" }}>
              <span className="flex items-center gap-1 whitespace-nowrap"><MarkIcon mark={x.mark} size={20} />{t(`mark.${x.mark}`)}</span>
              {x.reason && <span className="block text-sm font-normal text-muted">{t(`c.reason.${x.reason}`)}</span>}
            </span>
            {acc.has(x.field) && <span className="block text-sm font-semibold text-ok sm:col-span-4">{t("b.rec.accepted", { name: acc.get(x.field)!.by, time: when(acc.get(x.field)!.at, lang) })}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2">{c.unreadable ? <span className="font-semibold text-warn">{t("b.rec.unreadable")}</span> : <><span className="font-hand text-lg text-muted">{t("b.rec.gloss")}: </span>{c.gloss}</>}</p>
    </div>
  );
}

function Restatements({ r, t, lang }: { r: RecordDTO; t: T; lang: Lang }) {
  return (
    <section className="mt-6" aria-labelledby="rec-said">
      <h2 id="rec-said" className="font-display text-2xl font-extrabold leading-tight">{t("b.rec.said")}</h2>
      {r.restatements.length === 0 && <p className="mt-2 font-hand text-lg text-muted">{t("b.rec.noRestate")}</p>}
      {r.restatements.map((x, i) => (
        <div key={x.id} className="doodle keep mt-3 p-3">
          <p className="font-display text-lg font-extrabold">{t("b.rec.nth", { n: i + 1 })} <span className="font-hand text-base font-normal text-muted">· {x.by} · {when(x.created_at, lang)}</span></p>
          <p className="mt-1 font-hand text-base text-muted">{t("b.rec.words", { lang: LANG_NAME[x.language] })}</p>
          <blockquote lang={x.language} className="border-l-4 border-ink pl-3 text-lg">{x.text}</blockquote>
          {x.language !== lang && (
            <>
              <p className="mt-2 font-hand text-base text-muted">{t("b.rec.translated")}</p>
              <p className="border-l-4 border-pen pl-3 text-lg">{x.translated ?? <span className="text-muted">{t("b.rec.noTranslation")}</span>}</p>
            </>
          )}
          {x.checks.map((c) => <Check key={c.id} c={c} t={t} lang={lang} />)}
        </div>
      ))}
    </section>
  );
}

export function RecordView({ taskId }: { taskId: string }) {
  const { me, t } = useRequireMe();
  const [r, setR] = useState<RecordDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try { setR(await api("GET /api/tasks/:id/record", undefined, { id: taskId })); } catch (e) { setErr(errMsg(e, t)); }
  }, [taskId, t]);
  useEffect(() => { if (me) void load(); }, [me, load]);
  const lang = me?.language ?? "en";
  const [printedAt] = useState(() => Date.now());

  return (
    <div className="rec flex flex-1 flex-col">
      <style>{PRINT_CSS}</style>
      <div className="print:hidden"><AppHeader title={t("b.rec.title")} back={me?.role === "supervisor" ? "/insights" : "/inbox"} /></div>
      <Screen wide>
        {!me || (!r && !err) ? <PageLoading t={t} /> : err ? <ErrorBox message={err} onRetry={load} t={t} /> : r && (
          <div className="[overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-3xl font-extrabold leading-tight">{t("b.rec.title")}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-base">
                  <span className="font-semibold">{r.task.reader.object} · {r.task.worker.name}</span>
                  <TaskStatePill state={r.task.state} t={t} />
                  {r.task.is_sandbox && <Pill tint="warn">{t("b.rec.sandbox")}</Pill>}
                </p>
              </div>
              <Btn tone="hi" type="button" onClick={() => window.print()} className="print:hidden">{t("b.rec.print")}</Btn>
            </div>
            <Instruction r={r} t={t} />
            <Times r={r} t={t} lang={lang} />
            <Restatements r={r} t={t} lang={lang} />
            <section className="mt-6 keep" aria-labelledby="rec-conf">
              <h2 id="rec-conf" className="font-display text-2xl font-extrabold leading-tight">{t("b.rec.confirms")}</h2>
              {r.confirmations.length === 0 ? <p className="mt-2 font-hand text-lg text-muted">{t("b.rec.noConfirm")}</p> : (
                <ul className="doodle mt-2 space-y-1 p-3">{r.confirmations.map((c, i) => <li key={i}>{t("b.rec.confirmedBy", { name: c.by, time: whenFull(c.at, lang) })}</li>)}</ul>
              )}
            </section>
            <section className="mt-6" aria-labelledby="rec-events">
              <h2 id="rec-events" className="font-display text-2xl font-extrabold leading-tight">{t("b.rec.events")}</h2>
              <ol className="doodle mt-2 divide-y-2 divide-dashed divide-ink/30 p-0">
                {r.events.map((e) => (
                  <li key={e.id} title={e.detail || undefined} className="keep px-3 py-2">
                    <p className="flex flex-wrap items-baseline gap-x-3"><span className="font-mono text-sm">{whenFull(e.at, lang)}</span><span title={e.type} className="text-base font-bold">{evLabel(e.type, t)}</span><span className="text-sm text-muted">{e.by ?? t("b.rec.system")}</span></p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </Screen>
      {r && <p className="rec-foot hidden print:block">{t("b.rec.footer", { date: whenFull(printedAt, lang) })}</p>}
    </div>
  );
}
