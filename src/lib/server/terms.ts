// Site words: each crew's own glossary, and the cache rule that keeps translations in step with it.
import type { BetaLang, CoreLang, I18n, Labels, Lang, TermDTO } from "../types.ts";
import { matchTerms, translateText, type CrewLists, type SiteTerm } from "./ai.ts";
import { db, logHealth, ok } from "./db.ts";

export type TermRow = {
  id: string; crew_id: string; term: string; meaning_en: string; meaning_hi: string; meaning_ta: string; meanings_beta?: Partial<Record<BetaLang, string>> | null;
  note: string | null; source: "manual" | "flag"; created_by: string | null; created_at: string;
};

const meanings = (r: TermRow): Labels => ({ ...r.meanings_beta, en: r.meaning_en, hi: r.meaning_hi, ta: r.meaning_ta });
export const termDTO = (r: TermRow): TermDTO => ({
  id: r.id, term: r.term, meanings: meanings(r), note: r.note, source: r.source, created_at: r.created_at,
});
export const siteTerm = (r: TermRow): SiteTerm => ({ term: r.term, meanings: meanings(r) });

/** The crew's site words (A-Z) and its glossary version. */
export async function crewTerms(crewId: string): Promise<{ version: number; rows: TermRow[] }> {
  const [t, c] = await Promise.all([
    db().from("crew_terms").select("*").eq("crew_id", crewId).order("term"),
    db().from("crews").select("terms_version").eq("id", crewId).single(),
  ]);
  return { rows: ok(t) as TermRow[], version: (ok(c) as { terms_version: number }).terms_version ?? 0 };
}

/** Every glossary change bumps the crew's version (see `cachedIsStale`). */
export async function bumpTermsVersion(crewId: string) {
  const { error } = await db().rpc("bump_terms_version", { p_crew: crewId });
  if (error) throw new Error(`db: ${error.message}`);
}

/**
 * Translations are cached per (message id, reader language) and the cache does not keep the source text.
 * Each row records the crew's glossary version it was made under (null = made before site words existed, read as 0).
 * A cached row is stale only when it is older than the crew's current version AND the message, as sent now,
 * contains one of the current site words: then it is translated again and overwritten. Messages without any
 * site word keep their cached text, so a glossary edit never re-translates a whole history.
 * ponytail: a deleted word is no longer "current", so a message that used only that word keeps its older
 * translation; keep deleted terms as tombstones if that ever matters.
 */
export function cachedIsStale(rowVersion: number | null | undefined, crewVersion: number, text: string, terms: { term: string }[]): boolean {
  return (rowVersion ?? 0) < crewVersion && matchTerms(text, terms).length > 0;
}

export const LANG_COL: Record<CoreLang, "meaning_en" | "meaning_hi" | "meaning_ta"> = { en: "meaning_en", hi: "meaning_hi", ta: "meaning_ta" };

/**
 * Task text (object, note) into the languages in `to` (see `translationTargets`) with the crew's site words, the same way chat
 * translation uses them; any failure keeps the original text in that slot.
 * ponytail: the same loop as i18nAll in tasks.ts plus `terms`; give i18nAll a `terms` argument and delete this.
 */
export async function i18nSite(text: string, src: Lang, lists: CrewLists, terms: SiteTerm[], to: Lang[]): Promise<I18n & { en: string }> {
  const out: I18n & { en: string } = { en: text };
  for (const l of [src, ...to]) out[l] = text;
  await Promise.all(to.filter((l) => l !== src).map(async (l) => {
    const t0 = Date.now();
    try {
      out[l] = (await translateText(text, l, lists, undefined, terms))?.text ?? text;
      await logHealth("translate", true, null, Date.now() - t0);
    } catch {
      await logHealth("translate", false, "ai_error", Date.now() - t0);
    }
  }));
  return out;
}
