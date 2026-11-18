"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import type { ComponentProps } from "react";
import { BetaNote, LanguagePicker } from "./LanguagePicker";

// .doodle in globals.css is unlayered, so it beats Tailwind's bg-* utilities; "!" restores the tone background.
const BG = { ink: "bg-ink! text-paper", hi: "bg-hi! text-ink", pen: "bg-pen! text-white", ghost: "bg-card! text-ink", ok: "bg-ok! text-white", bad: "bg-bad! text-white" } as const;
export function Btn({ tone = "ink", className, ...p }: ComponentProps<typeof Button>) {
  return <Button {...p} tone={tone} className={cx(BG[tone], className)} />;
}
export const TINT = { ok: "bg-ok-soft!", warn: "bg-warn-soft!", bad: "bg-bad-soft!", pen: "bg-pen-soft!", hi: "bg-hi!" } as const;

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/** Hand-drawn loop: an arrow that closes on itself. */
export function LoopMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M8 22 C2 14, 8 5, 17 5 C26 5, 30 14, 25 21 C22 25, 16 27, 11 24" pathLength={1} className="draw" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
      <path d="M5 26 L11 24 L9 18" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-12 items-center gap-2 font-display text-xl font-extrabold">
      <LoopMark />ClarityLoop
    </Link>
  );
}

/** Header for signed-out pages. */
export function PublicHeader({ lang, setLang, t }: { lang: Lang; setLang: (l: Lang) => void; t: T }) {
  return (
    <>
      <header className="border-b-[2.5px] border-ink bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-1">
          <Brand />
          <LanguagePicker value={lang} onChange={setLang} label={t("nav.language")} />
        </div>
      </header>
      <BetaNote lang={lang} t={t} />
    </>
  );
}

export function PageLoading({ t }: { t: T }) {
  return <div className="flex flex-1 items-center justify-center p-10"><Spinner label={t("common.loading")} /></div>;
}

/** Error with a visible retry. */
export function ErrorBox({ message, onRetry, t }: { message: string; onRetry?: () => void; t: T }) {
  return (
    <div role="alert" className="doodle bg-bad-soft! p-4">
      <p className="font-semibold text-bad">{message}</p>
      {onRetry && <Btn tone="ink" className="mt-3" onClick={onRetry}>{t("common.retry")}</Btn>}
    </div>
  );
}

/** Turn any thrown value into a sentence in the user's language. */
export function errMsg(e: unknown, t: T): string {
  if (e instanceof ApiError) {
    const key = `err.${e.code}`;
    const s = t(key);
    return s === key ? t("err.generic") : s;
  }
  return t("err.network");
}

/** A link that looks like <Button>. */
export function LinkButton({ href, tone = "ink", className, children, target, rel, onClick }: { href: string; tone?: "ink" | "hi" | "pen" | "ghost"; className?: string; children: ReactNode; target?: string; rel?: string; onClick?: () => void }) {
  const bg = BG[tone];
  return (
    <Link href={href} target={target} rel={rel} onClick={onClick}
      className={cx("doodle doodle-2 inline-flex min-h-12 select-none items-center justify-center gap-2 px-5 py-2 text-center font-display text-base font-extrabold transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none", bg, className)}>
      {children}
    </Link>
  );
}

export function Section({ title, children, id }: { title?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-10">
      {title && <h2 className="mb-3 font-display text-2xl font-extrabold leading-tight">{title}</h2>}
      {children}
    </section>
  );
}

/** Hand-drawn squiggle underline divider. */
export function Squiggle() {
  return (
    <svg viewBox="0 0 200 12" className="my-6 h-3 w-40" fill="none" aria-hidden="true">
      <path d="M3 7 C15 1, 25 11, 38 6 S62 2, 76 7 S100 11, 114 6 S140 2, 156 7 S182 10, 197 5" pathLength={1} className="draw" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

/** Copies text; the label flips to "Copied" for a moment. */
export function CopyButton({ text, t, label }: { text: string; t: T; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* nothing more to try */ }
      ta.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1600);
  }
  return <Btn tone={done ? "ok" : "ghost"} type="button" onClick={copy} className="shrink-0 px-3">{done ? t("common.copied") : label ?? t("common.copy")}</Btn>;
}

/** "5 min ago" in the reader's language; older than a day shows the date. */
export function ago(iso: string, t: T, lang: Lang): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return t("time.now");
  if (m < 60) return t("time.min", { n: m });
  if (m < 1440) return t("time.hour", { n: Math.round(m / 60) });
  return new Date(iso).toLocaleDateString(`${lang}-IN`, { day: "numeric", month: "short" });
}
