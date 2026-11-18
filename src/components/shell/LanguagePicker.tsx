"use client";
import { LANGS, LANG_NAME, isBeta, type Lang } from "@/lib/types";
import type { T } from "@/lib/i18n";

/** Compact language switch: six languages do not fit a phone header as buttons, so a native select. Each name is in its own language. */
export function LanguagePicker({ value, onChange, label, busy }: { value: Lang; onChange: (l: Lang) => void; label: string; busy?: boolean }) {
  return (
    <select aria-label={label} value={value} disabled={busy} onChange={(e) => onChange(e.target.value as Lang)}
      className="min-h-12 max-w-[9.5rem] rounded-xl border-2 border-ink bg-card px-2 text-base font-bold text-ink">
      {LANGS.map((l) => <option key={l} value={l} lang={l}>{LANG_NAME[l]}{isBeta(l) ? " · beta" : ""}</option>)}
    </select>
  );
}

/** Under a header: shown while the reader's own language is a beta one. */
export function BetaNote({ lang, t }: { lang: Lang; t: T }) {
  if (!isBeta(lang)) return null;
  return <div role="note" lang={lang} className="border-b-[2.5px] border-ink bg-warn-soft px-4 py-1 text-center font-hand text-base text-ink">{t("lang.betaNote")}</div>;
}

/** Big buttons for the join and onboarding forms; the beta languages carry a "beta" mark and one line of explanation. */
export function LanguageGrid({ value, onChange, t }: { value: Lang; onChange: (l: Lang) => void; t: T }) {
  return (
    <>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {LANGS.map((l) => (
          <button key={l} type="button" lang={l} aria-pressed={value === l} onClick={() => onChange(l)}
            className={`doodle doodle-flat min-h-14 px-1 text-lg font-bold leading-tight ${value === l ? "bg-hi!" : "bg-card"}`}>
            {value === l && <span aria-hidden="true">&#10003; </span>}{LANG_NAME[l]}
            {isBeta(l) && <span className="block font-mono text-xs font-normal uppercase tracking-wide text-muted">{t("lang.beta")}</span>}
          </button>
        ))}
      </div>
      {!isBeta(value) && <p className="mt-1 text-sm leading-snug text-muted">{t("lang.betaNote")}</p>}{/* a beta reader gets it under the header */}
    </>
  );
}
