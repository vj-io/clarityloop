"use client";
// Roll-call board: one crew task, one row per worker, live. Every state is icon + word + colour.
// Workers see other workers only as "Understood" / "Not yet" (the server redacts; this only draws).
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import { LANG_NAME, type BoardRow, type BoardStatus, type BroadcastDTO } from "@/lib/types";
import { MarkIcon, Pill } from "@/components/ui";
import { TaskFacts } from "./cards";
import { HazardIcon, NotEqual } from "./doodles";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
const P = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TONE: Record<BoardStatus, { fg: string; row: string }> = {
  waiting: { fg: "text-muted", row: "" },
  not_yet: { fg: "text-muted", row: "" },
  checking: { fg: "text-pen", row: "bg-pen-soft/50" },
  mismatch: { fg: "text-bad", row: "bg-bad-soft border-l-[6px] border-l-bad" },
  needs_look: { fg: "text-warn", row: "bg-warn-soft/70 border-l-[6px] border-l-warn" },
  all_match: { fg: "text-[#0f6b31]", row: "bg-ok-soft/50" },
  understood: { fg: "text-[#0f6b31]", row: "bg-ok-soft" },
  done: { fg: "text-ink", row: "bg-ok-soft/60" },
};

function Glyph({ s }: { s: BoardStatus }) {
  if (s === "mismatch") return <MarkIcon mark="mismatch" size={26} />;
  if (s === "needs_look") return <MarkIcon mark="unclear" size={26} />;
  if (s === "all_match" || s === "understood" || s === "done") return <MarkIcon mark="match" size={26} />;
  const d = s === "checking" ? "M5 16 C5 8, 14 5, 20 9 M27 16 C27 24, 18 27, 12 23"
    : s === "waiting" ? "M16 4 C23 4, 28 9, 28 16 C28 23, 23 28, 16 28 C9 28, 4 23, 4 16 C4 9, 9 4, 15 4 M16 9 L16 16 L21 19"
    : "M16 4 C23 4, 28 9, 28 16 C28 23, 23 28, 16 28 C9 28, 4 23, 4 16 C4 9, 9 4, 15 4";
  return (
    <svg width={26} height={26} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <path {...P} d={d} stroke={s === "checking" ? "var(--pen)" : "var(--muted)"} strokeWidth={3.5} strokeDasharray={s === "not_yet" ? "4 4" : undefined} />
    </svg>
  );
}

function StatusWord({ s, t }: { s: BoardStatus; t: T }) {
  const word = s === "not_yet" ? t("x.board.notYet") : t(`state.${s}`);
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1.5 font-display text-lg font-extrabold leading-none", TONE[s].fg)}>
      <Glyph s={s} />{s === "checking" ? <span className="dots">{word}</span> : word}
    </span>
  );
}

/** Hand-drawn progress bar: a wobbly outline, a marker stroke for the understood share, a tick per worker. */
function Progress({ n, total }: { n: number; total: number }) {
  const W = 300, x0 = 8, x1 = W - 8, x = x0 + (total ? (n / total) * (x1 - x0) : 0);
  return (
    <svg viewBox={`0 0 ${W} 26`} preserveAspectRatio="none" className="mt-2 h-6 w-full" role="img" aria-label={`${n}/${total}`}>
      <path {...P} d={`M4 6 C80 3, 200 5, ${W - 4} 4 C${W - 2} 10, ${W - 3} 16, ${W - 4} 22 C200 24, 90 21, 5 23 C3 17, 4 11, 4 6 Z`}
        stroke="var(--ink)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" fill="var(--paper)" />
      {n > 0 && <path {...P} key={n} d={`M${x0 + 2} 13.5 L${Math.max(x0 + 3, x - 2)} 13`} stroke="var(--ok)" strokeWidth={12}
        pathLength={1} className="draw" />}
      {Array.from({ length: Math.max(0, total - 1) }, (_, i) => {
        const tx = x0 + ((i + 1) / total) * (x1 - x0);
        return <path key={i} {...P} d={`M${tx} 7 L${tx + 1} 20`} stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={0.45} />;
      })}
    </svg>
  );
}

/** Three stick heads: the crew. */
export function CrewDoodle({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <path {...P} d="M16 5 C19 5, 20 7, 20 9 C20 11.5, 18 13, 16 13 C13.5 13, 12 11, 12 9 C12 7, 13.5 5, 16 5 Z M9 27 C9 21, 12 17, 16 17 C20 17, 23 21, 23 27" stroke="var(--ink)" strokeWidth={2.8} />
      <path {...P} d="M7 10 C9 10, 10 11.5, 10 13 C10 14.5, 8.5 16, 7 16 C5 16, 4 14.5, 4 13 C4 11.5, 5 10, 7 10 Z M2 25 C2 21, 4 19, 7 19 M25 10 C27 10, 28 11.5, 28 13 C28 14.5, 27 16, 25 16 C23 16, 22 14.5, 22 13 C22 11.5, 23 10, 25 10 Z M30 25 C30 21, 28 19, 25 19" stroke="var(--ink)" strokeWidth={2.4} />
    </svg>
  );
}

function Row({ r, t, isSup }: { r: BoardRow; t: T; isSup: boolean }) {
  // The supervisor can confirm a matching reply right here, without opening each worker's chat.
  const [conf, setConf] = useState<"idle" | "busy" | "done" | "failed">("idle");
  async function confirm() {
    if (!r.task_id) return;
    setConf("busy");
    try { await api("POST /api/tasks/:id/confirm", undefined, { id: r.task_id }); setConf("done"); } catch { setConf("failed"); }
  }
  const needsMe = r.is_me && !isSup && r.conversation_id && r.status !== "understood" && r.status !== "done";
  return (
    <li className={cx("border-t-2 border-ink/15 px-4 py-3", TONE[r.status].row)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words font-display text-xl font-extrabold leading-tight">{r.worker.name}</span>
          {r.is_me && <Pill tint="hi">{t("x.board.you")}</Pill>}
          <Pill tint="pen">{LANG_NAME[r.worker.language]}</Pill>
        </div>
        <StatusWord s={r.status} t={t} />
      </div>
      {r.issues.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {r.issues.map((i) => (
            <li key={i.field} className="flex flex-wrap items-center gap-x-1.5 text-base leading-snug">
              <span className="font-hand text-lg">{t(`c.f.${i.field}`)}:</span>
              <span className="font-display font-extrabold break-words">{i.supervisor || "—"}</span>
              {i.mark === "mismatch" ? <NotEqual /> : <MarkIcon mark="unclear" size={18} />}
              <span className={cx("font-display font-extrabold break-words", i.mark === "mismatch" ? "text-bad" : "text-warn")}>{i.worker || t(`c.reason.not_mentioned`)}</span>
            </li>
          ))}
        </ul>
      )}
      {isSup && r.task_id && r.status === "all_match" && (
        <div className="mt-2">
          {conf === "done" ? <p className="font-hand text-lg text-[#0f6b31]">{t("v.board.confirmed", { worker: r.worker.name })}</p> : (
            <button type="button" onClick={confirm} disabled={conf === "busy"} aria-label={`${t("v.board.confirm")}: ${r.worker.name}`}
              className="doodle doodle-2 inline-flex min-h-12 items-center gap-2 bg-ok! px-5 font-display text-base font-extrabold text-white disabled:opacity-50">
              <MarkIcon mark="match" size={20} />{conf === "busy" ? <span className="dots">{t("common.wait")}</span> : t("v.board.confirm")}
            </button>
          )}
          {conf === "failed" && <p role="alert" className="mt-1 text-base font-semibold text-bad">{t("v.board.confirmFail")}</p>}
        </div>
      )}
      {isSup && r.conversation_id && (
        <Link href={`/c/${r.conversation_id}`} className="mt-1 inline-flex min-h-12 items-center gap-1 font-semibold text-pen underline decoration-2 underline-offset-4">
          {t("x.board.open")} →
        </Link>
      )}
      {needsMe && (
        <Link href={`/c/${r.conversation_id}`} className="mt-1 inline-flex min-h-12 items-center gap-1 font-semibold text-pen underline decoration-2 underline-offset-4">
          {t("x.board.sayBack")} →
        </Link>
      )}
    </li>
  );
}

export function BoardCard({ b, isSup, t }: { b: BroadcastDTO; isSup: boolean; t: T }) {
  const { understood: n, total } = b.progress;
  const all = total > 0 && n === total;
  return (
    <section className="doodle pop my-4 overflow-hidden p-0" aria-label={t("x.board.label")}>
      <header className="flex flex-wrap items-center gap-2 border-b-[2.5px] border-ink bg-hi px-4 py-2">
        <CrewDoodle />
        <span className="font-hand text-lg leading-none">{t("x.board.label")}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {b.is_safety && <Pill tint="bad"><HazardIcon />{t("x.form.safety")}</Pill>}
          {b.is_sandbox && <Pill tint="warn">{t("c.sandbox")}</Pill>}
        </span>
      </header>
      <div className="p-4">
        <p className="mb-2 text-sm text-muted">{t("x.board.from", { sup: b.supervisor.name })}</p>
        <TaskFacts v={b} t={t} />
        <div className="mt-4" role="status" aria-live="polite">
          <p className={cx("flex items-center gap-2 font-display text-2xl font-extrabold leading-tight", all && "text-[#0f6b31]")}>
            {all && <MarkIcon mark="match" size={30} />}
            {all ? t("x.board.allDone") : t("x.board.progress", { n, total })}
          </p>
          <Progress n={n} total={total} />
        </div>
      </div>
      {b.rows.length === 0 ? <p className="border-t-2 border-ink/15 px-4 py-3 text-muted">{t("x.board.noWorkers")}</p> : (
        <ul>{b.rows.map((r) => <Row key={r.worker.id} r={r} t={t} isSup={isSup} />)}</ul>
      )}
      {b.redacted && <p className="border-t-2 border-dashed border-ink/30 px-4 py-2 font-hand text-base leading-tight text-muted">{t("x.board.private", { sup: b.supervisor.name })}</p>}
    </section>
  );
}
