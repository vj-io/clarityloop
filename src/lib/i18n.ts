// Interface text in English, Hindi and Tamil. Each area owns one dictionary file.
// Beta languages (Bengali, Telugu, Marathi) have one flat file each in src/i18n/beta/.
// Relative imports with ".ts" so plain `node` can load this file (tests, scripts/i18n-keys.mjs).
import { isBeta, type BetaLang, type CoreLang, type Lang } from "./types.ts";
import { shell } from "../i18n/shell.ts";
import { chat } from "../i18n/chat.ts";
import { crewx } from "../i18n/crewx.ts";
import { biz } from "../i18n/biz.ts";
import { voice } from "../i18n/voice.ts";
import { terms } from "../i18n/terms.ts";
import { safety } from "../i18n/safety.ts";
import { langs } from "../i18n/langs.ts";
import { bn } from "../i18n/beta/bn.ts";
import { te } from "../i18n/beta/te.ts";
import { mr } from "../i18n/beta/mr.ts";

export type Dict = Record<string, Record<CoreLang, string>>;
export const DICT: Dict = { ...shell, ...chat, ...crewx, ...biz, ...voice, ...terms, ...safety, ...langs };
const all = DICT;
const BETA: Record<BetaLang, Record<string, string>> = { bn, te, mr };

/** t("key", { name: "Ravi" }) — "{name}" placeholders. Falls back to English, then the key. */
export function makeT(lang: Lang) {
  return (key: string, vars?: Record<string, string | number>) => {
    let s = (isBeta(lang) ? BETA[lang][key] : all[key]?.[lang]) || all[key]?.en || key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
export type T = ReturnType<typeof makeT>;
