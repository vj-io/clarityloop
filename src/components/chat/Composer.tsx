"use client";
// Sticky composer: Enter sends, Shift+Enter is a new line, 2000 chars max, 48px send button.
import Link from "next/link";
import { useRef, useState } from "react";
import type { T } from "@/lib/i18n";
import { ClipboardDoodle, SendDoodle } from "./doodles";

const MAX = 2000;

export function Composer({ t, offline, onSend, taskHref, taskLabel }: {
  t: T; offline: boolean; onSend: (text: string) => void; taskHref?: string; taskLabel?: string;
}) {
  const tl = taskLabel ?? t("c.sendAsTask");
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const v = text.trim();

  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; };
  function send() {
    if (!v || offline) return;
    onSend(v.slice(0, MAX));
    setText("");
    if (ref.current) { ref.current.style.height = "auto"; ref.current.focus(); }
  }

  return (
    <div className="sticky bottom-0 z-10 border-t-[2.5px] border-ink bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
      <div className="mx-auto max-w-3xl px-3 py-2">
        {offline && <p role="status" className="mb-1 font-hand text-lg leading-tight text-bad">{t("c.offlineReason")}</p>}
        <div className="flex items-end gap-2">
          {taskHref && (
            <Link href={taskHref} aria-label={tl}
              className="doodle doodle-flat inline-flex min-h-12 shrink-0 items-center gap-1.5 px-2.5 font-display text-sm font-extrabold leading-tight sm:px-3"
              style={{ background: "var(--hi)", boxShadow: "2px 2px 0 var(--ink)" }}>
              <ClipboardDoodle /><span className="hidden min-[400px]:inline">{tl}</span>
            </Link>
          )}
          <label className="sr-only" htmlFor="composer">{t("c.typeMessage")}</label>
          <textarea id="composer" ref={ref} rows={1} value={text} maxLength={MAX}
            onChange={(e) => { setText(e.target.value); grow(e.target); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            placeholder={t("c.typeMessage")}
            className="doodle doodle-flat min-h-12 min-w-0 flex-1 resize-none bg-card px-3 py-2.5 text-base leading-snug placeholder:text-muted/70" />
          <button type="button" onClick={send} disabled={!v || offline} aria-label={t("c.send")}
            className="doodle doodle-2 inline-flex h-12 w-12 shrink-0 items-center justify-center text-white transition-transform active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40"
            style={{ background: "var(--pen)" }}>
            <SendDoodle />
          </button>
        </div>
        {text.length > MAX - 200 && <p className="mt-0.5 text-right font-mono text-xs text-muted">{text.length}/{MAX}</p>}
      </div>
    </div>
  );
}
