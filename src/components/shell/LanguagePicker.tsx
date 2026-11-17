"use client";
import { LANGS, LANG_NAME, type Lang } from "@/lib/types";

/** Compact EN / हिन्दी / தமிழ் switch. Each label is in its own language. */
export function LanguagePicker({ value, onChange, label, busy }: { value: Lang; onChange: (l: Lang) => void; label: string; busy?: boolean }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={value === l}
          disabled={busy}
          onClick={() => value !== l && onChange(l)}
          className={`min-h-12 min-w-12 rounded-xl border-2 border-ink px-2 text-base font-bold ${value === l ? "bg-ink text-paper" : "bg-card text-ink"}`}
        >
          {l === "en" ? "EN" : LANG_NAME[l]}
        </button>
      ))}
    </div>
  );
}
