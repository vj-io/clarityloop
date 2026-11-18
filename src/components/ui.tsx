// Doodle primitives. Every screen is built from these so the app reads as one hand-drawn system.
"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { Mark } from "@/lib/types";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

type Tone = "ink" | "hi" | "pen" | "ghost" | "ok" | "bad";
const tone: Record<Tone, string> = {
  ink: "bg-ink text-paper",
  hi: "bg-hi text-ink",
  pen: "bg-pen text-white",
  ghost: "bg-card text-ink",
  ok: "bg-ok text-white",
  bad: "bg-bad text-white",
};

/** 48px minimum tap target (NFR). */
export function Button({ tone: t = "ink", className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...p}
      className={cx(
        "doodle doodle-2 min-h-12 px-5 py-2 font-display font-extrabold text-base inline-flex items-center justify-center gap-2 select-none",
        "transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        "disabled:opacity-45 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0",
        tone[t], className,
      )}
    >{children}</button>
  );
}

export function Card({ className, children, tint }: { className?: string; children: ReactNode; tint?: "ok" | "warn" | "bad" | "pen" | "hi" }) {
  const bg = tint ? { ok: "bg-ok-soft", warn: "bg-warn-soft", bad: "bg-bad-soft", pen: "bg-pen-soft", hi: "bg-hi" }[tint] : "";
  return <div className={cx("doodle p-4", bg, className)}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-hand text-lg leading-tight">{label}</span>
      {hint && <span className="block text-sm text-muted">{hint}</span>}
      <div className="mt-1">{children}</div>
      {error && <span role="alert" className="mt-1 block text-sm font-semibold text-bad">{error}</span>}
    </label>
  );
}

const inputCls = "doodle doodle-flat w-full min-h-12 px-3 py-2 text-base bg-card placeholder:text-muted/70";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;

/** Highlighter swipe under the key word. One per screen. */
export const Hl = ({ children }: { children: ReactNode }) => <span className="hl hl-in">{children}</span>;

/** Mark = icon + word + colour, never colour alone (NFR accessibility). The stroke draws itself. */
export function MarkIcon({ mark, size = 28 }: { mark: Mark | "accepted"; size?: number }) {
  const color = mark === "match" || mark === "accepted" ? "var(--ok)" : mark === "mismatch" ? "var(--bad)" : "var(--warn)";
  const d =
    mark === "match" || mark === "accepted" ? "M5 17 C8 19, 10 22, 12 25 C16 15, 22 9, 28 5"
    : mark === "mismatch" ? "M6 6 C12 12, 20 20, 26 27 M26 6 C19 12, 12 20, 6 27"
    : "M11 11 C11 4, 22 4, 22 11 C22 16, 16 15, 16 21 M16 26 L16 27";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <path d={d} pathLength={1} className="draw" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pill({ children, tint = "ghost" }: { children: ReactNode; tint?: "ok" | "warn" | "bad" | "pen" | "hi" | "ghost" }) {
  const c = { ok: "bg-ok-soft text-[#0f6b31]", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", pen: "bg-pen-soft text-pen", hi: "bg-hi text-ink", ghost: "bg-card text-ink" }[tint];
  return <span className={cx("inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-sm font-semibold", c)}>{children}</span>;
}

/** Hand-drawn arrow, for "this → that" moments. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 32" className={className} fill="none" aria-hidden="true">
      <path d="M4 18 C20 8, 44 26, 70 14 M58 6 C63 9, 68 12, 71 14 C67 18, 63 22, 60 27" pathLength={1} className="draw" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Spinner({ label }: { label: string }) {
  return <span role="status" className="font-hand text-lg text-muted"><span className="dots">{label}</span></span>;
}

/** Page frame: phone-first column, 360px safe. */
export function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main id="main" className={cx("mx-auto w-full flex-1 px-4 py-5", wide ? "max-w-5xl" : "max-w-xl")}>{children}</main>;
}
