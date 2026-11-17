// Interface text in English, Hindi and Tamil. Each area owns one dictionary file.
import type { Lang } from "@/lib/types";
import { shell } from "@/i18n/shell";
import { chat } from "@/i18n/chat";
import { crewx } from "@/i18n/crewx";
import { biz } from "@/i18n/biz";
import { voice } from "@/i18n/voice";

export type Dict = Record<string, Record<Lang, string>>;
const all: Dict = { ...shell, ...chat, ...crewx, ...biz, ...voice };

/** t("key", { name: "Ravi" }) — "{name}" placeholders. Falls back to English, then the key. */
export function makeT(lang: Lang) {
  return (key: string, vars?: Record<string, string | number>) => {
    let s = all[key]?.[lang] ?? all[key]?.en ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
export type T = ReturnType<typeof makeT>;
