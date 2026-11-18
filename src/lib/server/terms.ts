// Site words: each crew's own glossary, and the cache rule that keeps translations in step with it.
import type { Lang, TermDTO } from "../types.ts";
import { matchTerms, type SiteTerm } from "./ai.ts";
import { db, ok } from "./db.ts";

export type TermRow = {
  id: string; crew_id: string; term: string; meaning_en: string; meaning_hi: string; meaning_ta: string;
  note: string | null; source: "manual" | "flag"; created_by: string | null; created_at: string;
};

export const termDTO = (r: TermRow): TermDTO => ({
  id: r.id, term: r.term, meanings: { en: r.meaning_en, hi: r.meaning_hi, ta: r.meaning_ta }, note: r.note, source: r.source, created_at: r.created_at,
});
export const siteTerm = (r: TermRow): SiteTerm => ({ term: r.term, meanings: { en: r.meaning_en, hi: r.meaning_hi, ta: r.meaning_ta } });

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

export const LANG_COL: Record<Lang, "meaning_en" | "meaning_hi" | "meaning_ta"> = { en: "meaning_en", hi: "meaning_hi", ta: "meaning_ta" };
