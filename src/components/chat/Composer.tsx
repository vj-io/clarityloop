"use client";
// Sticky composer: Enter sends, Shift+Enter is a new line, 2000 chars max, 48px send button.
// Mic: spoken words land in the box to read and edit; nothing is sent until Send. Crew: "@" offers the crew.
import Link from "next/link";
import { useRef, useState } from "react";
import type { T } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { ClipboardDoodle, SendDoodle } from "./doodles";
import { MicButton, MicStatus, useMic } from "./voice";

const MAX = 2000;
export type Mentionable = { id: string; name: string };   // id = Nexconn user id

export function Composer({ t, lang, offline, onSend, taskHref, taskLabel, members }: {
  t: T; lang: Lang; offline: boolean; onSend: (text: string, mentions: string[]) => void; taskHref?: string; taskLabel?: string;
  members?: Mentionable[];
}) {
  const tl = taskLabel ?? t("c.sendAsTask");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const v = text.trim();
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  const mic = useMic(lang, text, (s) => { setText(s.slice(0, MAX)); requestAnimationFrame(() => grow(ref.current)); });

  // "@" picker: what is typed after the last "@" (names can have spaces) filters the crew
  const at = members?.length ? /(^|\s)@([^@\n]{0,30})$/.exec(text) : null;
  const choices = at ? members!.filter((m) => m.name.toLowerCase().startsWith(at[2].toLowerCase())).slice(0, 6) : [];
  function pick(m: Mentionable) {
    setText(`${text.slice(0, text.length - at![2].length - 1)}@${m.name} `);
    setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
    ref.current?.focus();
  }

  function send() {
    if (!v) return;   // offline too: the message waits in the outbox and goes when the line is back
    const body = v.slice(0, MAX);
    onSend(body, picked.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id));
    setText(""); setPicked([]);
    if (ref.current) { ref.current.style.height = "auto"; ref.current.focus(); }
  }

  return (
    <div data-composer className="sticky bottom-0 z-10 border-t-[2.5px] border-ink bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
      <div className="mx-auto max-w-3xl px-3 py-2">
        {offline && <p role="status" className="mb-1 font-hand text-lg leading-tight text-bad">{t("c.offlineReason")}</p>}
        {choices.length > 0 && (
          <div role="group" aria-label={t("v.mention")} className="mb-1.5 flex flex-wrap gap-1.5">
            {choices.map((m) => (
              <button key={m.id} type="button" onClick={() => pick(m)}
                className="min-h-12 rounded-full border-2 border-ink bg-hi px-3 font-display font-extrabold">@{m.name}</button>
            ))}
          </div>
        )}
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
            className="doodle doodle-flat min-h-12 min-w-0 flex-1 resize-none bg-card px-3 py-2.5 text-base leading-snug placeholder:text-muted" />
          <MicButton mic={mic} t={t} />
          <button type="button" onClick={send} disabled={!v} aria-label={t("c.send")}
            className="doodle doodle-2 inline-flex h-12 w-12 shrink-0 items-center justify-center text-white transition-transform active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40"
            style={{ background: "var(--pen)" }}>
            <SendDoodle />
          </button>
        </div>
        <MicStatus mic={mic} t={t} />
        {text.length > MAX - 200 && <p className="mt-0.5 text-right font-mono text-xs text-muted">{text.length}/{MAX}</p>}
      </div>
    </div>
  );
}
