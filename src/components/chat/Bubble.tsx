"use client";
// One chat message. Theirs: translated in place, original one tap away. Mine: as I typed it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import { LANG_NAME, type ChatMsg, type Lang, type TaskDraft } from "@/lib/types";
import type { Tr } from "./useConversation";
import { Tail } from "./doodles";
import { SpeakButton } from "./voice";
import { WhichWord } from "./terms";

export const hhmm = (ms: number | string) =>
  new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

const linkBtn = "inline-flex min-h-12 items-center text-left font-semibold text-pen underline decoration-2 underline-offset-4";

export function Bubble({ mine, text, at, name, children, failed, waiting, onRetry, t, tool, status, atMe, actions }: {
  mine: boolean; text: string; at?: number; name?: string; children?: React.ReactNode;
  /** failed: refused, tap to retry · waiting: queued until the connection is live */
  failed?: boolean; waiting?: boolean; onRetry?: () => void; t: T;
  /** footer: a button on the left (read aloud), a status before the time (read receipt) */
  tool?: React.ReactNode; status?: React.ReactNode;
  /** this message @mentions me: lime highlighter + tag */
  atMe?: boolean;
  /** small text actions under the bubble ("Make this a task"): shown on hover, or after a tap on the bubble */
  actions?: React.ReactNode;
}) {
  const fill = mine ? "var(--pen-soft)" : "var(--card)";
  const [open, setOpen] = useState(false);
  // a tap on the bubble (not on a button or link inside it) shows its actions
  const toggle = actions ? (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
    const row = e.currentTarget.querySelector<HTMLElement>("[data-actions]");
    setOpen((v) => !v);
    // the last bubble's row would open under the sticky composer: bring it into view (scroll-margin keeps it above)
    requestAnimationFrame(() => row?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  } : undefined;
  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="mb-3 max-w-[85%] rounded-xl sm:max-w-[70%]" onClick={toggle} tabIndex={actions ? 0 : undefined}>
        {/* bubble and tail share a box, so the tail stays under the bubble even with a retry line below it */}
        <div className="relative">
        <div
          className={`doodle doodle-flat px-3.5 pb-1.5 pt-2 ${mine ? "doodle-2" : ""} ${failed ? "border-dashed !border-bad" : waiting ? "border-dashed" : ""}`}
          style={{ background: fill, boxShadow: "2px 2px 0 var(--ink)" }}
        >
          {!mine && (name || atMe) && (
            <div className="flex flex-wrap items-center gap-x-2 font-hand text-base leading-tight text-pen">
              {name}{atMe && <span className="rounded-full border-2 border-ink bg-hi px-1.5 font-display text-xs font-extrabold text-ink">{t("v.atYou")}</span>}
            </div>
          )}
          <p className="whitespace-pre-wrap break-words text-base leading-snug"><span className={atMe ? "hl" : undefined}>{text}</span></p>
          {children}
          {(at !== undefined || tool || status) && (
            <div className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2">
              {tool && <span className="-my-1 -ml-2.5 mr-auto">{tool}</span>}
              {status}
              {at !== undefined && <span className="font-mono text-xs text-muted">{hhmm(at)}</span>}
            </div>
          )}
        </div>
        <Tail side={mine ? "right" : "left"} fill={fill} />
        </div>
        {actions && (
          <div data-actions className={`${open ? "flex" : "hidden"} mt-2 scroll-mb-28 flex-wrap gap-x-3 group-hover:flex group-focus-within:flex ${mine ? "justify-end" : "justify-start"}`}>
            {actions}
          </div>
        )}
        {failed && (
          <button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-12 items-center gap-1 font-semibold text-bad underline decoration-2 underline-offset-4">
            {t("c.notSent")}
          </button>
        )}
      </div>
    </div>
  );
}

/** A message from the other person (or a non-card bot line), with its translation state. */
export function TheirBubble({ m, name, tr, t, onRetry, onFlag, lang, atMe, actions, onSuggest }: {
  m: ChatMsg; name?: string; tr: Tr | undefined; t: T;
  onRetry: () => void; onFlag: () => Promise<void>;
  lang: Lang; atMe?: boolean; actions?: React.ReactNode;
  /** after "Translation looks wrong": which word, and what it means (goes to the supervisor's site words) */
  onSuggest?: (word: string, meaning: string) => Promise<void>;
}) {
  const [showOrig, setShowOrig] = useState(false);
  const [flagState, setFlagState] = useState<"idle" | "busy" | "err" | "done">("idle");
  const translated = tr?.state === "done" && tr.dto.text !== null ? tr.dto : null;
  // read aloud only text in the reader's language: the translation, or the original when it already is
  const readable = tr?.state === "done" ? (translated ? translated.text! : m.text) : null;

  return (
    <Bubble mine={false} name={name} at={m.at} text={translated ? translated.text! : m.text} t={t} atMe={atMe} actions={actions}
      tool={readable ? <SpeakButton id={`m-${m.id}`} text={readable} lang={lang} t={t} /> : undefined}>
      {(!tr || tr.state === "pending") && (
        <div role="status" className="font-hand text-base text-muted"><span className="dots">{t("c.translating")}</span></div>
      )}
      {(tr?.state === "error" || tr?.state === "slow") && (
        <button type="button" onClick={onRetry} className={`${linkBtn} text-sm text-warn`}>
          {t(tr.state === "slow" ? "c.trSlow" : "c.trFailed")}
        </button>
      )}
      {translated && (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-1 border-t-2 border-dashed border-ink/20 text-sm text-muted">
            <span>{t("c.translatedFrom", { lang: translated.source_lang ? LANG_NAME[translated.source_lang] : "?" })} ·</span>
            <button type="button" aria-expanded={showOrig} onClick={() => setShowOrig((v) => !v)} className={`${linkBtn} text-sm`}>
              {t(showOrig ? "c.hideOriginal" : "c.seeOriginal")}
            </button>
          </div>
          {showOrig && (
            <div className="mb-1 rounded-lg border-2 border-ink/30 bg-paper px-2.5 py-1.5">
              <p lang={translated.source_lang ?? undefined} className="whitespace-pre-wrap break-words font-hand text-lg leading-snug">{m.text}</p>
              {translated.flagged ? (
                <>
                  <p role="status" className="py-2 text-sm font-semibold text-[#0f6b31]">{t("c.flagged")}</p>
                  {flagState === "done" && onSuggest && <WhichWord t={t} onSend={onSuggest} />}
                </>
              ) : (
                <button type="button" disabled={flagState === "busy"} className={`${linkBtn} text-sm text-muted`}
                  onClick={async () => { setFlagState("busy"); try { await onFlag(); setFlagState("done"); } catch { setFlagState("err"); } }}>
                  {t(flagState === "err" ? "c.flagFailed" : "c.flag")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Bubble>
  );
}

/** "Make this a task": reads the message into a draft, then opens the task form filled from it (via sessionStorage). */
export const draftKey = (conversationId: string) => `cl_task_draft_${conversationId}`;
export type StoredDraft = { draft: TaskDraft | null; text: string };
export function MakeTaskButton({ conversationId, text, language, t }: { conversationId: string; text: string; language: Lang; t: T }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    let draft: TaskDraft | null = null;
    try { draft = (await api("POST /api/tasks/draft", { conversation_id: conversationId, text, language })).draft; } catch { /* the form opens empty with a calm note */ }
    try { sessionStorage.setItem(draftKey(conversationId), JSON.stringify({ draft, text } satisfies StoredDraft)); } catch { /* storage blocked: empty form */ }
    router.push(`/c/${conversationId}/task/new`);
  }
  return (
    <button type="button" onClick={go} disabled={busy} className={`${linkBtn} gap-1 text-base`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10v17H7zM10 9h4M10 13h4M10 17h2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {busy ? <span className="dots">{t("g.making")}</span> : t("g.makeTask")}
    </button>
  );
}
