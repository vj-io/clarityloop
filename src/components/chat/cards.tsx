"use client";
// Server cards drawn from stored data in the reader's language: task, meaning check (red / amber / green),
// state lines, Understood, Done. Only the newest card of a task is live; older ones collapse.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import { LANG_NAME, NUDGE_GAP_MS, NUDGE_STATES, type CheckDTO, type CheckRow, type FieldKey, type Lang, type Me, type Overall, type TaskDTO, type TaskState } from "@/lib/types";
import { Button, Hl, MarkIcon, Pill } from "@/components/ui";
import { BigCheck, HazardIcon, MarkerUnderline, NotEqual } from "./doodles";
import { hhmm } from "./Bubble";
import { MicButton, MicStatus, SpeakButton, useMic } from "./voice";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
const OVERALL_TINT: Record<Overall, "bad" | "warn" | "ok"> = { mismatch: "bad", needs_look: "warn", all_match: "ok" };
const TINT_BG = { bad: "bg-bad-soft", warn: "bg-warn-soft", ok: "bg-ok-soft", pen: "bg-pen-soft", ink: "bg-card" } as const;
const TINT_FG = { bad: "text-bad", warn: "text-warn", ok: "text-[#0f6b31]", pen: "text-pen", ink: "text-ink" } as const;
// .doodle (unlayered CSS) beats Tailwind bg-* utilities (layered), so coloured doodle buttons need inline backgrounds.
export const BG = { hi: { background: "var(--hi)" }, pen: { background: "var(--pen)" }, ok: { background: "var(--ok)" }, ink: { background: "var(--ink)" } } as const;
export const RESTATE_STATES: TaskState[] = ["waiting", "checking", "mismatch", "needs_look", "all_match"];

const errText = (t: T, e: unknown) =>
  e instanceof ApiError ? (e.status === 429 ? t("c.err.slow") : e.code === "ai_unavailable" ? t("c.err.ai") : t("c.err.generic")) : t("c.err.network");

// ---------------------------------------------------------------- frame + collapse
/** Card shell: tinted header strip with a handwritten label. `live=false` -> greyed, collapsed, no actions. */
export function CardFrame({ tint, label, title, live, earlier, children, aside }: {
  tint: keyof typeof TINT_BG; label: string; title: ReactNode; live: boolean; earlier: string;
  children: ReactNode; aside?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!live && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="doodle doodle-flat my-3 flex min-h-12 w-full items-center gap-2 bg-paper px-3 py-2 text-left grayscale">
        <span className="font-hand text-base text-muted">{earlier}</span>
        <span className="min-w-0 flex-1 break-words font-display font-extrabold leading-tight">{title}</span>
        <span aria-hidden="true" className="font-display text-lg text-pen">+</span>
      </button>
    );
  }
  return (
    <section className={cx("doodle pop my-4 overflow-hidden p-0", !live && "grayscale")} aria-label={typeof title === "string" ? title : label}>
      <header className={cx("flex items-center gap-2 border-b-[2.5px] border-ink px-4 py-2", TINT_BG[tint])}>
        <span className={cx("font-hand text-lg leading-none", TINT_FG[tint])}>{label}</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">{aside}</span>
      </header>
      <div className="p-4">{children}</div>
      {!live && (
        <button type="button" onClick={() => setOpen(false)} className="min-h-12 w-full border-t-2 border-dashed border-ink/30 font-semibold text-pen">
          {earlier}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- task card
export type TaskView = Pick<TaskDTO, "action" | "object" | "place" | "due_time" | "quantity" | "unit" | "note" | "is_sandbox">;
export const qty = (q: number | null, unit: string | null) => (q === null ? null : `${q}${unit ? ` ${unit}` : ""}`);

/** The task's facts. Shared by the live card and the task-form preview. */
export function TaskFacts({ v, t }: { v: TaskView; t: T }) {
  const q = qty(v.quantity, v.unit);
  return (
    <>
      <p className="font-display text-2xl font-extrabold leading-tight break-words">
        {v.action || "—"}{v.object ? <span className="font-sans font-semibold"> · {v.object}</span> : null}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
        <dt className="font-hand text-lg text-muted">{t("c.f.place")}</dt>
        <dd className="font-display text-xl font-extrabold break-words">{v.place || "—"}</dd>
        <dt className="font-hand text-lg text-muted">{t("c.f.time")}</dt>
        <dd className="font-mono text-xl font-bold">{v.due_time || "—"}</dd>
        {q && <>
          <dt className="font-hand text-lg text-muted">{t("c.f.quantity")}</dt>
          <dd className="font-mono text-xl font-bold break-words">{q}</dd>
        </>}
      </dl>
      {v.note && <p className="mt-3 border-l-4 border-hi pl-3 text-base italic break-words">{v.note}</p>}
    </>
  );
}

const STATE_TINT: Record<TaskState, "ghost" | "pen" | "bad" | "warn" | "ok" | "hi"> = {
  waiting: "pen", checking: "pen", mismatch: "bad", needs_look: "warn", all_match: "ok", understood: "ok", done: "ghost",
};
export function StatePill({ task, t, mine }: { task: TaskDTO; t: T; mine?: boolean }) {
  const tint = STATE_TINT[task.state];
  // `mine`: the reader is the worker, so "waiting" speaks to them, not about them
  const word = mine && task.state === "waiting" ? t("c.state.waitingYou") : t(`c.state.${task.state}`, { worker: task.worker.name });
  // the shared Pill's green is 4.4:1 on its tint; the darker ink keeps it readable
  return <Pill tint={tint}>{tint === "ok" ? <span className="text-[#0f6b31]">{word}</span> : word}</Pill>;
}

/** The task as one sentence in the reader's language, for reading aloud. Times are passed as written ("14:00"). */
export const taskSentence = (v: TaskView, t: T) => [
  [v.action, v.object].filter(Boolean).join(" "),
  v.place && `${t("c.f.place")}: ${v.place}`,
  v.due_time && `${t("c.f.time")}: ${v.due_time}`,
  qty(v.quantity, v.unit) && `${t("c.f.quantity")}: ${qty(v.quantity, v.unit)}`,
  v.note,
].filter(Boolean).join(". ");

/** "Read is not understood", on the card: when the worker opened the task vs whether it is understood yet. */
function SeenLine({ task, t }: { task: TaskDTO; t: T }) {
  const understood = task.state === "understood" || task.state === "done";
  if (!task.seen_at) return <p className="mt-2 font-hand text-base text-muted">{t("x.seen.notYet", { worker: task.worker.name })}</p>;
  return (
    <p className={`mt-2 flex flex-wrap items-center gap-x-2 font-hand text-lg ${understood ? "text-[#0f6b31]" : "text-warn"}`}>
      <span className="inline-flex items-center gap-1"><MarkIcon mark="match" size={20} />{t("x.seen.at", { time: hhmm(task.seen_at) })}</span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1 font-semibold"><MarkIcon mark={understood ? "match" : "unclear"} size={20} />{t(understood ? "x.seen.understood" : "x.seen.notUnderstood")}</span>
    </p>
  );
}

export function TaskCard({ task, live, t, lang, showSeen, children }: { task: TaskDTO; live: boolean; t: T; lang: Lang; showSeen?: boolean; children?: ReactNode }) {
  return (
    <CardFrame tint="pen" label={t("c.card.task")} live={live} earlier={t("c.earlierTask")}
      title={`${task.action} · ${task.place} · ${task.due_time}`}
      aside={<>
        {task.is_safety && <Pill tint="bad"><HazardIcon />{t("x.form.safety")}</Pill>}
        {task.broadcast_id && <Pill tint="hi">{t("x.task.crewBadge")}</Pill>}
        {task.is_sandbox && <Pill tint="warn">{t("c.sandbox")}</Pill>}
      </>}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{t("c.taskFrom", { sup: task.supervisor.name, worker: task.worker.name })}</p>
        <SpeakButton id={`task-${task.id}`} text={taskSentence(task, t)} lang={lang} t={t} className="-my-2 -mr-2" />
      </div>
      <TaskFacts v={task} t={t} />
      <div className="mt-3"><StatePill task={task} t={t} mine={showSeen === false} /></div>
      {showSeen && <SeenLine task={task} t={t} />}
      {showSeen && live && <RemindButton task={task} t={t} />}
      {children}
    </CardFrame>
  );
}

// ---------------------------------------------------------------- restate box (worker, in their language)
export function RestateBox({ task, t, lang, onResult }: {
  task: TaskDTO; t: T; lang: Lang; onResult: (task: TaskDTO, check: CheckDTO) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  // speak instead of type: the words land in the box to read and fix; only "Check" sends them
  const mic = useMic(lang, text, (s) => setText(s.slice(0, 500)));
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const again = task.state !== "waiting" && task.state !== "checking";

  async function submit() {
    const v = text.trim();
    if (!v) { setErr(t("c.restate.empty")); inputRef.current?.focus(); return; }
    setBusy(true); setErr(null); setSlow(false);
    const timer = setTimeout(() => setSlow(true), 6000);
    try {
      const r = await api("POST /api/tasks/:id/restate", { text: v }, { id: task.id });
      setText("");
      onResult(r.task, r.check);
    } catch (e) {
      setErr(errText(t, e)); // the typed text stays in the box
    } finally { clearTimeout(timer); setBusy(false); setSlow(false); }
  }

  return (
    <div className="mt-4 rounded-2xl border-[2.5px] border-dashed border-pen bg-pen-soft/60 p-3">
      <label htmlFor={`restate-${task.id}`} className="block font-display text-xl font-extrabold leading-tight">
        {t(again ? "c.restate.again" : "c.restate.prompt")}
      </label>
      <p className="font-hand text-lg leading-tight text-pen">{t("c.restate.noOk")}</p>
      <div className="mt-2 flex items-start gap-2">
        <textarea id={`restate-${task.id}`} ref={inputRef} value={text} maxLength={500} rows={3} disabled={busy}
          onChange={(e) => setText(e.target.value)} placeholder={t("c.restate.placeholder")}
          className="doodle doodle-flat min-w-0 flex-1 resize-y bg-card px-3 py-2 text-base placeholder:text-muted" />
        <MicButton mic={mic} t={t} disabled={busy} />
      </div>
      <MicStatus mic={mic} t={t} />
      {err && <p role="alert" className="mt-1 text-sm font-semibold text-bad">{err}</p>}
      <Button tone="pen" className="mt-2 w-full" style={BG.pen} onClick={submit} disabled={busy}>
        {busy ? <span className="dots">{t("c.restate.checking")}</span> : t("c.restate.submit")}
      </Button>
      {busy && slow && <p role="status" className="mt-1 font-hand text-lg text-muted">{t("c.restate.slow")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- the Meaning Mismatch card
const REASON_KEY: Record<NonNullable<CheckRow["reason"]>, string> = {
  not_mentioned: "c.reason.not_mentioned", unknown: "c.reason.unknown", afternoon_assumed: "c.reason.afternoon_assumed",
  hour_ambiguous: "c.reason.hour_ambiguous", vague: "c.reason.vague", unreadable: "c.reason.unreadable", extra: "c.reason.extra", unit: "c.reason.unit",
};

function MarkWord({ row, t }: { row: CheckRow; t: T }) {
  const m = row.accepted ? "accepted" : row.mark;
  const fg = m === "mismatch" ? "text-bad" : m === "unclear" ? "text-warn" : "text-[#0f6b31]";
  return (
    <span className={cx("inline-flex min-w-0 max-w-full items-center gap-1 font-display font-extrabold leading-tight", fg)}>
      <MarkIcon mark={m} size={26} /><span className="min-w-0 [overflow-wrap:anywhere]">{t(`c.mark.${m}`)}</span>
    </span>
  );
}

function Row({ row, t, canAccept, onAccept, busy, supName, workerName }: {
  row: CheckRow; t: T; canAccept: boolean; onAccept: () => void; busy: boolean; supName: string; workerName: string;
}) {
  const bad = row.mark === "mismatch";
  const unclear = row.mark === "unclear" && !row.accepted;
  return (
    <li data-flag={bad || unclear ? "" : undefined} className={cx(
      "border-t-2 border-ink/15 px-3 py-2.5 first:border-t-0",
      "sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_2rem_minmax(0,1fr)_11.5rem] sm:items-center sm:gap-x-2",
      bad && "border-l-[6px] !border-l-bad bg-bad-soft", unclear && "border-l-[6px] !border-l-warn bg-warn-soft/70",
    )}>
      <div className="flex items-center justify-between gap-2 sm:contents">
        <span className="font-hand text-xl leading-tight sm:order-1">{t(`c.f.${row.field}`)}</span>
        <span className="min-w-0 sm:order-5"><MarkWord row={row} t={t} /></span>
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-2 sm:contents">
        <div className="min-w-0 sm:order-2">
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted sm:hidden">{supName}</span>
          <span className="font-display text-lg font-extrabold break-words">{row.supervisor || "—"}</span>
        </div>
        <span className="self-center pb-0.5 sm:order-3">{bad ? <NotEqual /> : <span className="inline-block w-[30px]" />}</span>
        <div className="min-w-0 sm:order-4">
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted sm:hidden">{workerName}</span>
          <span className={cx("relative inline-block font-display text-lg font-extrabold break-words", bad && "text-bad")}>
            {row.worker || "—"}{bad && <MarkerUnderline />}
          </span>
        </div>
      </div>
      {(row.reason || canAccept) && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 sm:order-6 sm:col-span-5 sm:mt-0.5">
          {row.reason && <span className="font-hand text-lg leading-tight text-muted">{t(REASON_KEY[row.reason])}</span>}
          {canAccept && (
            <Button tone="ghost" className="ml-auto min-h-12 px-4 text-sm" disabled={busy}
              onClick={onAccept}>
              <MarkIcon mark="accepted" size={20} />{t("c.accept", { worker: workerName })}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function CheckCard({ check, task, me, live, t, myLang, otherLang, onTask, onFocusRestate, children }: {
  check: CheckDTO; task: TaskDTO; me: Me; live: boolean; t: T; myLang: Lang; otherLang: Lang;
  onTask: (task: TaskDTO) => void; onFocusRestate: () => void; children?: ReactNode;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSup = me.id === task.supervisor.id;
  const isWorker = me.id === task.worker.id;
  const anyBad = check.rows.some((r) => r.mark === "mismatch");
  const anyUnclear = check.rows.some((r) => r.mark === "unclear" && !r.accepted);
  // unreadable stays amber until the worker says it back again: there are no worker values to accept
  const unreadable = check.unreadable && anyUnclear;
  const overall: Overall = unreadable ? "needs_look" : check.overall;
  const tint = OVERALL_TINT[overall];
  const title = unreadable ? t("c.check.unreadable") : check.overall === "all_match" && check.rows.some((r) => r.accepted) ? t("c.check.accepted") : t(`c.check.${check.overall}`);
  const iConfirmed = task.confirmations.some((c) => c.profile_id === me.id);
  const canConfirm = live && task.state === "all_match" && !anyBad && !anyUnclear;
  const nameOf = (id: string) => (id === task.supervisor.id ? task.supervisor.name : id === task.worker.id ? task.worker.name : "?");

  async function act(fn: () => Promise<{ task: TaskDTO }>) {
    setErr(null); setBusy(true);
    try { onTask((await fn()).task); }
    catch (e) {
      if (e instanceof ApiError && (e.code === "blocked" || e.status === 409)) setErr(t("c.err.stale"));
      else setErr(errText(t, e));
      // whatever happened, redraw from the server's latest state
      try { onTask((await api("GET /api/tasks/:id", undefined, { id: task.id })).task); } catch { /* keep */ }
    } finally { setBusy(false); }
  }

  const sameGloss = myLang === otherLang || check.gloss === check.gloss_other;
  return (
    <CardFrame tint={tint} live={live} earlier={t("c.earlierCheck")} title={title}
      label={t("c.card.check", { worker: task.worker.name })}
      aside={task.is_sandbox ? <Pill tint="warn">{t("c.sandbox")}</Pill> : null}>
      <h3 className={cx("flex items-center gap-2 font-display text-[1.7rem] font-extrabold leading-none", TINT_FG[tint])}>
        <MarkIcon mark={overall === "mismatch" ? "mismatch" : overall === "needs_look" ? "unclear" : "match"} size={36} />
        {overall === "mismatch" ? <span className="hl hl-in text-ink">{title}</span> : title}
      </h3>
      <p className="mt-1 text-base text-muted">{t(unreadable ? "c.check.unreadableHint" : title === t("c.check.accepted") ? "c.check.acceptedHint" : `c.check.${check.overall}Hint`)}</p>

      {/* the worker's own words */}
      <figure className={cx("mt-3 rounded-xl border-2 border-ink/25 bg-paper px-3 py-2", unreadable && "border-warn border-[2.5px] bg-warn-soft/50")}>
        <figcaption className="font-hand text-base text-muted">{t(isWorker ? "c.check.yourWords" : "c.check.theirWords", { worker: task.worker.name })}</figcaption>
        <blockquote lang={check.restatement.language} className={cx("font-hand leading-snug break-words", unreadable ? "text-2xl" : "text-xl")}>
          “{check.restatement.text}”
        </blockquote>
        {check.restatement.translated && (
          <p className="mt-1 border-t-2 border-dashed border-ink/20 pt-1 text-base break-words">
            <span className="text-sm text-muted">{t("c.inYourLang")} </span>{check.restatement.translated}
          </p>
        )}
      </figure>

      {/* five-row comparison */}
      <div className="mt-3 overflow-hidden rounded-xl border-[2.5px] border-ink bg-card">
        <div className="hidden border-b-[2.5px] border-ink bg-paper px-3 py-1.5 font-hand text-base text-muted sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_2rem_minmax(0,1fr)_11.5rem] sm:gap-x-2">
          <span>{t("c.col.field")}</span><span>{task.supervisor.name}</span><span /><span>{task.worker.name}</span><span>{t("c.col.mark")}</span>
        </div>
        <ul>
          {check.rows.map((r) => (
            <Row key={r.field} row={r} t={t} busy={busy} supName={task.supervisor.name} workerName={task.worker.name}
              canAccept={live && isSup && r.mark === "unclear" && !r.accepted && !!r.worker}
              onAccept={() => act(() => api("POST /api/tasks/:id/accept-field", { field: r.field as FieldKey }, { id: task.id }))} />
          ))}
        </ul>
      </div>

      {/* what we understood */}
      {!check.unreadable && (check.gloss || check.gloss_other) && (
        <div className="mt-3">
          <p className="font-hand text-lg leading-tight">{t(isWorker ? "c.understood.yours" : "c.understood.theirs", { worker: task.worker.name })}</p>
          <p className="flex items-center gap-1 text-base break-words">
            <span className="min-w-0 flex-1"><Pill>{LANG_NAME[myLang]}</Pill> {check.gloss}</span>
            <SpeakButton id={`gloss-${check.id}`} text={check.gloss} lang={myLang} t={t} className="-my-2" />
          </p>
          {!sameGloss && <p className="mt-1 text-base text-muted break-words"><Pill>{LANG_NAME[otherLang]}</Pill> <span lang={otherLang}>{check.gloss_other}</span></p>}
          {live && isWorker && (
            <button type="button" onClick={onFocusRestate} className="mt-1 inline-flex min-h-12 items-center font-semibold text-pen underline decoration-2 underline-offset-4">
              {t("c.notWhatIMeant")}
            </button>
          )}
        </div>
      )}

      {live && isSup && <RemindButton task={task} t={t} onTask={onTask} />}
      {/* restating comes first while anything is red or unclear */}
      {!canConfirm && children}
      {/* confirm — open only when every row matches or is accepted */}
      {live && (
        <div className="mt-4 border-t-2 border-dashed border-ink/30 pt-3">
          {iConfirmed ? (
            <p className="flex items-center gap-2 font-display text-lg font-extrabold text-[#0f6b31]">
              <MarkIcon mark="match" size={26} />{t("c.youConfirmed", { other: isSup ? task.worker.name : task.supervisor.name })}
            </p>
          ) : (
            <Button tone="ok" className="w-full text-lg" style={canConfirm ? BG.ok : { background: "var(--paper)", color: "var(--muted)", borderStyle: "dashed" }} disabled={!canConfirm || busy}
              onClick={() => act(() => api("POST /api/tasks/:id/confirm", undefined, { id: task.id }))}>
              <MarkIcon mark="match" size={24} />{t("c.confirm")}
            </Button>
          )}
          {!canConfirm && !iConfirmed && (
            <p className="mt-1.5 flex items-start gap-1.5 text-base font-semibold text-muted">
              <span aria-hidden="true" className="font-hand text-xl leading-none">↑</span>
              {t(anyBad ? "c.confirmBlocked.bad" : unreadable ? "c.confirmBlocked.unreadable" : anyUnclear ? "c.confirmBlocked.unclear" : "c.confirmBlocked.wait")}
            </p>
          )}
          {task.confirmations.length > 0 && (
            <p className="mt-1.5 text-sm text-muted">
              {t("c.confirmedSoFar")} {task.confirmations.map((c) => `${nameOf(c.profile_id)} ${hhmm(c.confirmed_at)}`).join(" · ")}
            </p>
          )}
          {err && <p role="alert" className="mt-1 text-sm font-semibold text-bad">{err}</p>}
        </div>
      )}
      {canConfirm && children}
    </CardFrame>
  );
}

// ---------------------------------------------------------------- state lines and final cards
export function StateLine({ children, tone = "pen" }: { children: ReactNode; tone?: "pen" | "ok" }) {
  return (
    <div role="status" className="my-3 flex justify-center">
      <span className={cx("inline-flex items-center gap-2 rounded-full border-2 border-dashed px-3 py-1 font-hand text-lg", tone === "ok" ? "border-ok text-[#0f6b31]" : "border-pen text-pen")}>
        {children}
      </span>
    </div>
  );
}

const summary = (task: TaskDTO) => [task.action, task.object, task.place, task.due_time, qty(task.quantity, task.unit)].filter(Boolean).join(" · ");

export function UnderstoodCard({ task, me, live, t, onTask }: { task: TaskDTO; me: Me; live: boolean; t: T; onTask: (t: TaskDTO) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isSup = me.id === task.supervisor.id;
  return (
    <CardFrame tint="ok" label={t("c.card.understood")} live={live} earlier={t("c.earlierCheck")} title={t("c.understoodTitle")}
      aside={task.is_sandbox ? <Pill tint="warn">{t("c.sandbox")}</Pill> : null}>
      <div className="flex items-center gap-3">
        <BigCheck />
        <div className="min-w-0">
          <h3 className="font-display text-3xl font-extrabold leading-none"><Hl>{t("c.understoodTitle")}</Hl></h3>
          <p className="mt-1 text-base">{t("c.understoodBy", { sup: task.supervisor.name, worker: task.worker.name })}</p>
          {task.understood_at && <p className="font-mono text-sm text-muted">{hhmm(task.understood_at)}</p>}
        </div>
      </div>
      <p className="mt-3 rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 font-display font-extrabold break-words">{summary(task)}</p>
      {live && isSup && task.state === "understood" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button tone="ink" disabled={busy} className="flex-1" style={BG.ink}
            onClick={async () => {
              setBusy(true); setErr(null);
              try { onTask((await api("POST /api/tasks/:id/done", undefined, { id: task.id })).task); }
              catch (e) { setErr(errText(t, e)); }
              finally { setBusy(false); }
            }}>{t("c.markDone")}</Button>
          <Link href="/tasks" className="inline-flex min-h-12 items-center font-semibold text-pen underline decoration-2 underline-offset-4">{t("c.seeTaskList")}</Link>
        </div>
      )}
      {isSup && <RecordLink id={task.id} t={t} />}
      {err && <p role="alert" className="mt-1 text-sm font-semibold text-bad">{err}</p>}
    </CardFrame>
  );
}

const RecordLink = ({ id, t }: { id: string; t: T }) => (
  <Link href={`/record/${id}`} className="mt-1 inline-flex min-h-12 items-center font-semibold text-pen underline decoration-2 underline-offset-4">{t("b.in.record")} →</Link>
);

export function DoneCard({ task, live, t, isSup }: { task: TaskDTO; live: boolean; t: T; isSup?: boolean }) {
  return (
    <CardFrame tint="ink" label={t("c.card.done")} live={live} earlier={t("c.earlierCheck")} title={t("c.doneTitle")}>
      <div className="flex items-center gap-3">
        <MarkIcon mark="match" size={44} />
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-extrabold leading-none">{t("c.doneTitle")}</h3>
          <p className="mt-1 text-base">{t("c.doneBy", { sup: task.supervisor.name })}{task.done_at && <span className="font-mono text-sm text-muted"> · {hhmm(task.done_at)}</span>}</p>
        </div>
      </div>
      <p className="mt-3 font-display font-extrabold break-words text-muted">{summary(task)}</p>
      {isSup && <RecordLink id={task.id} t={t} />}
    </CardFrame>
  );
}

/** Placeholder while a card's data loads (or failed to). */
export function CardLoading({ t, onRetry }: { t: T; onRetry?: () => void }) {
  const [late, setLate] = useState(false);
  useEffect(() => { const id = setTimeout(() => setLate(true), 5000); return () => clearTimeout(id); }, []);
  return (
    <div data-card-loading className="doodle doodle-flat my-3 px-4 py-3">
      {!late ? <span className="font-hand text-lg text-muted"><span className="dots">{t("c.cardLoading")}</span></span>
        : <button type="button" onClick={onRetry} className="min-h-12 font-semibold text-pen underline underline-offset-4">{t("c.cardRetry")}</button>}
    </div>
  );
}

// ---------------------------------------------------------------- reminders

/** Supervisor: "Remind {worker}" while the task still needs a say-back; "Reminded 14:10" after. One per 10 minutes. */
export function RemindButton({ task, t, onTask }: { task: TaskDTO; t: T; onTask?: (task: TaskDTO) => void }) {
  const [mine, setNudgedAt] = useState<string | null>(null);   // set by my own click before the task refetch lands
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const nudgedAt = [task.nudged_at ?? null, mine].filter(Boolean).sort().pop() ?? null;
  const next = nudgedAt ? Date.parse(nudgedAt) + NUDGE_GAP_MS : 0;
  useEffect(() => {
    if (next <= now) return;
    const id = setTimeout(() => setNow(Date.now()), next - now + 500);
    return () => clearTimeout(id);
  }, [next, now]);
  if (!NUDGE_STATES.includes(task.state)) return null;
  const wait = next > now;
  // a say-back that came after the reminder answered it: "Reminded 13:56" would point at something already dealt with
  const answered = !!nudgedAt && !!task.latest_check && Date.parse(task.latest_check.created_at) > Date.parse(nudgedAt);

  async function remind() {
    setBusy(true); setErr(null);
    try {
      const r = await api("POST /api/tasks/:id/nudge", undefined, { id: task.id });
      setNudgedAt(r.task.nudged_at ?? new Date().toISOString());
      onTask?.(r.task);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        // reminded meanwhile (another tab): show when, from the server's copy
        try { const r = await api("GET /api/tasks/:id", undefined, { id: task.id }); setNudgedAt(r.task.nudged_at ?? null); onTask?.(r.task); } catch { /* keep */ }
      } else setErr(errText(t, e));
    } finally { setBusy(false); setNow(Date.now()); }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      {!wait && (
        <Button tone="ghost" className="min-h-12 px-4" disabled={busy} onClick={remind}>
          <BellIcon />{busy ? <span className="dots">{t("g.reminding")}</span> : t("g.remind", { worker: task.worker.name })}
        </Button>
      )}
      {nudgedAt && !answered && (
        <p className="flex flex-wrap items-center gap-x-2 font-hand text-lg leading-tight text-pen">
          <span className="inline-flex items-center gap-1"><BellIcon />{t("g.reminded", { time: hhmm(nudgedAt) })}</span>
          {wait && <span className="text-base text-muted">{t("g.remindAgain", { time: hhmm(next) })}</span>}
        </p>
      )}
      {err && <p role="alert" className="w-full text-sm font-semibold text-bad">{err}</p>}
    </div>
  );
}

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The stored "Remind" card, in the reader's language. The worker gets a button to the say-back box while it is open. */
export function NudgeLine({ task, me, at, t, onGo }: { task: TaskDTO; me: Me; at: number; t: T; onGo: () => void }) {
  if (me.id === task.supervisor.id) return <StateLine><BellIcon />{t("g.nudge.sup", { worker: task.worker.name, time: hhmm(at) })}</StateLine>;
  if (me.id === task.worker.id && RESTATE_STATES.includes(task.state)) {
    return (
      <div role="status" className="my-3 flex justify-center">
        <div className="doodle doodle-flat flex max-w-md flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center" style={BG.hi}>
          <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold leading-tight"><BellIcon />{t("g.nudge.worker", { sup: task.supervisor.name })}</span>
          <button type="button" onClick={onGo} className="inline-flex min-h-12 items-center font-semibold text-ink underline decoration-2 underline-offset-4">
            {t("g.nudge.go")}
          </button>
        </div>
      </div>
    );
  }
  return <StateLine><BellIcon />{t("g.nudge.past", { sup: task.supervisor.name, time: hhmm(at) })}</StateLine>;
}
