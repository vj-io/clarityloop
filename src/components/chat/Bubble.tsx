"use client";
// One chat message. Theirs: translated in place, original one tap away. Mine: as I typed it.
import { useState } from "react";
import type { T } from "@/lib/i18n";
import { LANG_NAME, type ChatMsg } from "@/lib/types";
import type { Tr } from "./useConversation";
import { Tail } from "./doodles";

export const hhmm = (ms: number | string) =>
  new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

const linkBtn = "inline-flex min-h-12 items-center text-left font-semibold text-pen underline decoration-2 underline-offset-4";

export function Bubble({ mine, text, at, name, children, failed, onRetry, t }: {
  mine: boolean; text: string; at?: number; name?: string; children?: React.ReactNode;
  failed?: boolean; onRetry?: () => void; t: T;
}) {
  const fill = mine ? "var(--pen-soft)" : "var(--card)";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`relative mb-3 max-w-[85%] sm:max-w-[70%] ${failed ? "opacity-80" : ""}`}>
        <div
          className={`doodle doodle-flat px-3.5 pb-1.5 pt-2 ${mine ? "doodle-2" : ""} ${failed ? "border-dashed !border-bad" : ""}`}
          style={{ background: fill, boxShadow: "2px 2px 0 var(--ink)" }}
        >
          {!mine && name && <div className="font-hand text-base leading-tight text-pen">{name}</div>}
          <p className="whitespace-pre-wrap break-words text-base leading-snug">{text}</p>
          {children}
          {at !== undefined && <div className="mt-0.5 text-right font-mono text-xs text-muted">{hhmm(at)}</div>}
        </div>
        <Tail side={mine ? "right" : "left"} fill={fill} />
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
export function TheirBubble({ m, name, tr, t, onRetry, onFlag }: {
  m: ChatMsg; name?: string; tr: Tr | undefined; t: T;
  onRetry: () => void; onFlag: () => Promise<void>;
}) {
  const [showOrig, setShowOrig] = useState(false);
  const [flagState, setFlagState] = useState<"idle" | "busy" | "err">("idle");
  const translated = tr?.state === "done" && tr.dto.text !== null ? tr.dto : null;

  return (
    <Bubble mine={false} name={name} at={m.at} text={translated ? translated.text! : m.text} t={t}>
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
                <p role="status" className="py-2 text-sm font-semibold text-ok">{t("c.flagged")}</p>
              ) : (
                <button type="button" disabled={flagState === "busy"} className={`${linkBtn} text-sm text-muted`}
                  onClick={async () => { setFlagState("busy"); try { await onFlag(); setFlagState("idle"); } catch { setFlagState("err"); } }}>
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
