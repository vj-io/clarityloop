import { z } from "zod";
import { BETA_LANGS, CORE_LANGS, LangSchema, type SuggestionDTO } from "@/lib/types";
import { translationTargets } from "@/lib/server/ai";
import { requireMe } from "@/lib/server/auth";
import { betaOnly, crewLangs, crewLists } from "@/lib/server/crew";
import { db, ok, overLimit } from "@/lib/server/db";
import { body, fail, json, notFound, route } from "@/lib/server/http";
import { i18nAll } from "@/lib/server/tasks";
import { bumpTermsVersion, crewTerms, LANG_COL, termDTO, type TermRow } from "@/lib/server/terms";

export const runtime = "nodejs";

const Term = z.string().trim().min(1).max(40);
const Meaning = z.string().trim().min(1).max(120);
const dup = (e: { code?: string } | null) => e?.code === "23505";

/** The crew's site words; the supervisor also gets the open suggestions from "Translation looks wrong". */
export const GET = route(async (req) => {
  const me = await requireMe(req);
  if (!me.crew_id) return notFound();
  const { rows } = await crewTerms(me.crew_id);
  let suggestions: SuggestionDTO[] = [];
  if (me.role === "supervisor") {
    const s = ok(await db().from("term_suggestions").select("id, word, meaning, lang, created_at, profiles(display_name)")
      .eq("crew_id", me.crew_id).eq("status", "open").order("created_at", { ascending: false }).limit(20)) as unknown as
      { id: string; word: string; meaning: string | null; lang: SuggestionDTO["lang"]; created_at: string; profiles: { display_name: string } | null }[];
    suggestions = s.map((x) => ({ id: x.id, word: x.word, meaning: x.meaning, lang: x.lang, by: x.profiles?.display_name ?? "", created_at: x.created_at }));
  }
  return json({ terms: rows.map(termDTO), suggestions });
});

/** Add a site word with its meaning in one language; the other two are translated once (editable afterwards). */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({ term: Term, meaning: Meaning, lang: LangSchema.optional(), suggestion_id: z.uuid().optional() }));
  if (await overLimit(me.id, "term_add", 10)) return fail(429, "rate_limited");
  const [lists, langs] = await Promise.all([crewLists(me.crew_id), crewLangs(me.crew_id)]);
  const m = await i18nAll(b.meaning, b.lang ?? me.language, lists, translationTargets(langs, CORE_LANGS));
  const { data, error } = await db().from("crew_terms").insert({
    crew_id: me.crew_id, term: b.term, meaning_en: m.en.slice(0, 120), meaning_hi: (m.hi ?? m.en).slice(0, 120), meaning_ta: (m.ta ?? m.en).slice(0, 120), meanings_beta: betaOnly(m, 120),
    source: b.suggestion_id ? "flag" : "manual", created_by: me.id,
  }).select("*").single();
  if (dup(error)) return fail(409, "conflict", "this word is already a site word");
  const row = ok({ data, error }) as TermRow;
  await Promise.all([
    bumpTermsVersion(me.crew_id),
    b.suggestion_id ? db().from("term_suggestions").update({ status: "added" }).eq("id", b.suggestion_id).eq("crew_id", me.crew_id) : null,
  ]);
  return json({ term: termDTO(row) });
});

/** Edit a site word or any of its meanings. `meanings_beta` replaces the stored beta meanings as a whole. */
export const PATCH = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({
    id: z.uuid(), term: Term.optional(), meaning_en: Meaning.optional(), meaning_hi: Meaning.optional(), meaning_ta: Meaning.optional(),
    note: z.string().trim().max(200).nullish(), meanings_beta: z.partialRecord(z.enum(BETA_LANGS), Meaning).optional(),
  }));
  const patch: Record<string, unknown> = {};
  if (b.term) patch.term = b.term;
  for (const col of Object.values(LANG_COL)) if (b[col]) patch[col] = b[col]!;
  if (b.note !== undefined) patch.note = b.note || null;
  if (b.meanings_beta) patch.meanings_beta = b.meanings_beta;
  if (!Object.keys(patch).length) return fail(400, "invalid", "nothing to change");
  const { data, error } = await db().from("crew_terms").update(patch).eq("id", b.id).eq("crew_id", me.crew_id).select("*").maybeSingle();
  if (dup(error)) return fail(409, "conflict", "this word is already a site word");
  const row = ok({ data, error }) as TermRow | null;
  if (!row) return notFound();
  await bumpTermsVersion(me.crew_id);
  return json({ term: termDTO(row) });
});

export const DELETE = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({ id: z.uuid() }));
  const del = ok(await db().from("crew_terms").delete().eq("id", b.id).eq("crew_id", me.crew_id).select("id"));
  if (!del.length) return notFound();
  await bumpTermsVersion(me.crew_id);
  return json({ ok: true });
});
