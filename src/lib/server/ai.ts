// Every model call lives here: translateText and extractFields (PRD "AI design").
// DB-free and alias-free so scripts/eval.mjs can import it with plain `node`.
// Only message text and crew list labels go to the model, never names or account data.
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import { ExtractionSchema, LangSchema, inLang, isBeta, type CoreLang, type Extraction, type Labels, type Lang, type TaskDraft } from "../types.ts";
import { resolveTime } from "../compare.ts";

export type LabelledItem = { id: string; labels: Labels };
export type CrewLists = { places: LabelledItem[]; actions: LabelledItem[] };
export type ModelRequest = { system: string; prompt: string; maxTokens: number };
/** Injectable model call: returns the raw text answer, throws when the service fails. */
export type Runner = (req: ModelRequest) => Promise<string>;

export const AI_MODEL = process.env.AI_MODEL || "google/gemini-3.5-flash-lite";
const NAME: Record<Lang, string> = { en: "English", hi: "Hindi", ta: "Tamil", bn: "Bengali", te: "Telugu", mr: "Marathi" };

/**
 * Languages worth an AI call for stored text: English (the comparison code reads it), what the crew's
 * members read, and `always`. Readers of any other language fall back to English.
 */
export const translationTargets = (members: Lang[], always: readonly Lang[] = []): Lang[] => [...new Set<Lang>(["en", ...always, ...members])];

/**
 * Vercel AI Gateway via a plain model string (auth: VERCEL_OIDC_TOKEN or AI_GATEWAY_API_KEY).
 * If GOOGLE_GENERATIVE_AI_API_KEY is set, "google/..." models go straight to Google instead,
 * so the app runs without a card on the gateway account.
 */
// Models tried in order when the first one is out of quota or overloaded. Each Gemini model has its own
// free-tier daily quota, so the chain multiplies what a free key can serve in a day.
const FALLBACKS = (process.env.AI_FALLBACK_MODELS ?? "google/gemini-3.1-flash-lite,google/gemini-3-flash-preview")
  .split(",").map((m) => m.trim()).filter(Boolean);
const restingUntil = new Map<string, number>(); // model -> time it may be tried again
const QUOTA = /quota|rate.?limit|429|resource.?exhausted/i, BUSY = /high demand|overloaded|503|unavailable/i;

export function gatewayRunner(model: string = AI_MODEL): Runner {
  const chain = [model, ...FALLBACKS.filter((m) => m !== model)];
  return async ({ system, prompt, maxTokens }) => {
    const now = Date.now();
    const order = chain.filter((m) => (restingUntil.get(m) ?? 0) <= now);
    let last: unknown = new Error("every AI model is resting after a quota error");
    for (const m of order.length ? order : chain.slice(0, 1)) {
      try {
        const r = await generateText({
          model: process.env.GOOGLE_GENERATIVE_AI_API_KEY && m.startsWith("google/") ? google(m.slice("google/".length)) : m,
          instructions: system || undefined, prompt, temperature: 0,
          maxOutputTokens: maxTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(10_000),
        });
        return r.text;
      } catch (e) {
        last = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (QUOTA.test(msg)) restingUntil.set(m, now + 30 * 60_000);       // daily quota: leave it alone for half an hour
        else if (BUSY.test(msg)) restingUntil.set(m, now + 60_000);
        else throw e;                                                     // a real error: do not hide it behind another model
      }
    }
    throw last;
  };
}
let dflt: Runner | undefined;
const defaultRunner = () => (dflt ??= gatewayRunner());

// ---------- very short replies: answered from a fixed list, no AI call ----------
const QUICK: { out: Record<Lang, string>; say: Record<CoreLang, string[]> }[] = [
  { out: { en: "OK", hi: "ठीक है", ta: "சரி", bn: "ঠিক আছে", te: "సరే", mr: "ठीक आहे" }, say: {
    en: ["ok", "okay", "okk", "k", "fine", "alright", "sure"],
    hi: ["theek hai", "thik hai", "theek h", "thik h", "tik hai", "acha", "achha", "accha", "ठीक है", "ठीक", "अच्छा", "ओके"],
    ta: ["sari", "seri", "saringa", "சரி", "சரிங்க"] } },
  { out: { en: "Yes", hi: "हाँ", ta: "ஆமா", bn: "হ্যাঁ", te: "అవును", mr: "हो" }, say: {
    en: ["yes", "yeah", "yep", "ya"],
    hi: ["haan", "han", "haa", "haan ji", "haanji", "ji", "ji haan", "हाँ", "हां", "जी", "जी हाँ"],
    ta: ["aama", "aamaa", "aam", "ஆமா", "ஆம்", "ஆமாம்"] } },
  { out: { en: "No", hi: "नहीं", ta: "இல்லை", bn: "না", te: "కాదు", mr: "नाही" }, say: {
    en: ["no", "nope"], hi: ["nahi", "nahin", "nai", "na", "नहीं", "ना"], ta: ["illa", "illai", "இல்லை", "இல்ல"] } },
  { out: { en: "Thank you", hi: "धन्यवाद", ta: "நன்றி", bn: "ধন্যবাদ", te: "ధన్యవాదాలు", mr: "धन्यवाद" }, say: {
    en: ["thanks", "thank you", "thx", "ty"], hi: ["dhanyavad", "dhanyawad", "shukriya", "धन्यवाद", "शुक्रिया"], ta: ["nandri", "nanri", "நன்றி"] } },
  { out: { en: "Done", hi: "हो गया", ta: "முடிஞ்சது", bn: "হয়ে গেছে", te: "అయిపోయింది", mr: "झालं" }, say: {
    en: ["done"], hi: ["ho gaya", "hogaya", "ho gya", "हो गया"], ta: ["mudinjathu", "mudinjidhu", "முடிஞ்சது", "முடிந்தது"] } },
  { out: { en: "Coming", hi: "आ रहा हूँ", ta: "வர்றேன்", bn: "আসছি", te: "వస్తున్నాను", mr: "येत आहे" }, say: {
    en: ["coming", "on my way"], hi: ["aa raha hoon", "aa raha hu", "aa rha hu", "आ रहा हूँ", "आ रहा हूं"], ta: ["varen", "varren", "வர்றேன்", "வருகிறேன்"] } },
];
const QUICK_INDEX = new Map<string, { out: Record<Lang, string>; lang: Lang }>();
for (const q of QUICK) for (const lang of ["en", "hi", "ta"] as const) for (const s of q.say[lang]) QUICK_INDEX.set(s, { out: q.out, lang });

const normalize = (s: string) => s.toLowerCase().replace(/[.!?,।]+/g, " ").replace(/\s+/g, " ").trim();

export type Translation = { text: string; source_lang: Lang };
/** undefined = not a quick word; null = show as is; otherwise the fixed translation. */
export function quickTranslate(text: string, target: Lang): Translation | null | undefined {
  if (!/[\p{L}\p{N}]/u.test(text)) return null; // emoji / punctuation only, e.g. a thumbs-up
  const hit = QUICK_INDEX.get(normalize(text));
  if (!hit) return undefined;
  return hit.lang === target ? null : { text: hit.out[target], source_lang: hit.lang };
}

// ---------- numbers must survive translation ----------
export const asciiDigits = (s: string) => s
  .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x966))
  .replace(/[௦-௯]/g, (c) => String(c.charCodeAt(0) - 0xbe6))
  .replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x9e6))
  .replace(/[౦-౯]/g, (c) => String(c.charCodeAt(0) - 0xc66));
/** Digit runs in `src` that do not appear as a whole run in `out`. */
export function missingNumbers(src: string, out: string): string[] {
  const have = new Set(asciiDigits(out).match(/\d+/g) ?? []);
  return (asciiDigits(src).match(/\d+/g) ?? []).filter((n) => !have.has(n));
}

/**
 * Protected words. Place names are fixed labels: every spelling maps to the reader's label.
 * Action words are verbs, so they are given as preferred wording, to be conjugated naturally
 * (forcing the bare label into a sentence produced broken text in real model runs).
 */
export function glossary(lists: CrewLists, target: Lang): string {
  const line = (it: CrewLists["places"][number]) =>
    `${[...new Set(Object.values(it.labels))].map((x) => `"${x}"`).join(" or ")} is written "${inLang(it.labels, target)}"`;
  return `Place names (use the exact label):\n${lists.places.map(line).join("\n")}\n\n` +
    `Task words (prefer this wording, conjugated naturally, normal capitalisation):\n${lists.actions.map(line).join("\n")}`;
}

/** First complete {...} object in a model answer, tolerating code fences or chatter around it. */
export function parseJsonObject(raw: string): unknown {
  const a = raw.indexOf("{");
  if (a < 0) throw new Error("no json");
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(raw.slice(a, i + 1));
  }
  throw new Error("no json");
}

/**
 * Is the translation actually written in the reader's language? Catches a model that hands the source
 * back with only a place name swapped. @mentions and digits are ignored; names may stay in Latin letters.
 */
const SCRIPT: Record<Lang, RegExp> = {   // Marathi is written in Devanagari, like Hindi
  en: /[A-Za-z]/, hi: /[\u0900-\u097F]/, mr: /[\u0900-\u097F]/, ta: /[\u0B80-\u0BFF]/, bn: /[\u0980-\u09FF]/, te: /[\u0C00-\u0C7F]/,
};
export function inScript(out: string, target: Lang): boolean {
  const letters = out.replace(/@\S+/g, " ").match(/\p{L}/gu) ?? [];
  if (letters.length < 4) return true;
  const want = SCRIPT[target];
  return letters.filter((c) => want.test(c)).length / letters.length >= (target === "en" ? 0.6 : 0.45);
}

// ---------- site words: the crew's own glossary ----------
export type SiteTerm = { term: string; meanings: Labels };
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * The site words that occur in `text`, case-insensitively. A word must start at a word edge in every script.
 * Latin-script words must also end at one (an English plural "s"/"es" is allowed: "JCBs"); Hindi and Tamil
 * endings attach to the word ("மேஸ்திரியிடம்", "सरियों" is not matched but "सरिया को" is), so there only the start is checked.
 */
export function matchTerms<T extends { term: string }>(text: string, terms: T[]): T[] {
  return terms.filter(({ term }) => {
    const w = term.trim();
    if (!w) return false;
    const latinEnd = /[A-Za-z0-9.]$/.test(w);
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRe(w)}${latinEnd ? "(?:e?s)?(?![\\p{L}\\p{M}\\p{N}])" : ""}`, "iu").test(text);
  });
}
/** Prompt block for the site words found in the message; "" when none. Kept apart from the list glossary. */
export function siteWordsBlock(terms: SiteTerm[], target: Lang): string {
  if (!terms.length) return "";
  return "Site words (this crew's own words; when the message uses one, it means what is given here: translate accordingly, " +
    "and keep the word itself recognisable where natural):\n" +
    terms.map((t) => `"${t.term}" means "${inLang(t.meanings, target)}"`).join("\n");
}

const TranslationOut = z.object({ source_lang: LangSchema, text: z.string().min(1) });

/**
 * Translate one chat message (or task text) for a reader.
 * null => already in the reader's language, show as is. Throws when the AI fails twice.
 * `terms`: the crew's site words; only those that occur in the message are sent.
 */
export async function translateText(text: string, target: Lang, lists: CrewLists, runner: Runner = defaultRunner(), terms: SiteTerm[] = []): Promise<Translation | null> {
  if (!text.trim()) return null;
  const quick = quickTranslate(text, target);
  if (quick !== undefined) return quick;
  const system = [
    "You translate short work-chat messages between a construction-site supervisor and workers.",
    'Languages: "en" English, "hi" Hindi, "ta" Tamil. Hindi typed in Roman letters (Hinglish, e.g. "2 baje tak aa jaana") is Hindi: "hi". Tamil typed in Roman letters is "ta". Also "bn" Bengali, "te" Telugu, "mr" Marathi, in their own script or in Roman letters.',
    `Translate the message into ${NAME[target]} in its normal script. Keep it short, plain and in the same tone.`,
    "Keep every number, time and quantity exactly as written, using the digits 0-9. Keep people's names unchanged.",
    "When the message names a place from the list, write exactly its label. Never copy list notation into the translation.",
    `If the message is already in ${NAME[target]}, return it unchanged.`,
    'Answer with JSON only: {"source_lang":"en|hi|ta|bn|te|mr","text":"<translation>"}',
  ].join("\n");
  const site = siteWordsBlock(matchTerms(text, terms), target);
  const prompt = `${glossary(lists, target)}\n\n${site ? `${site}\n\n` : ""}Message:\n${text}`;
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = TranslationOut.parse(parseJsonObject(await runner({ system, prompt, maxTokens: 600 })));
      if (out.source_lang === target) return null;
      if (!inScript(out.text, target)) throw new Error(`not in ${NAME[target]}`);
      const lost = missingNumbers(text, out.text);
      if (lost.length) throw new Error(`numbers lost: ${lost.join(",")}`);
      return { text: out.text, source_lang: out.source_lang };
    } catch (e) { last = e; }
  }
  throw new Error(`translation failed: ${last instanceof Error ? last.message : String(last)}`);
}

// ---------- other names for a task's object ----------
/**
 * Names a worker might use for the same thing ("steel rods": iron rods, rebar, sariya, ...). Made only from
 * the supervisor's text, before any reply exists, so the comparison itself stays plain code.
 * Returns [] when the AI is unavailable: the check then falls back to the literal comparison.
 */
export async function objectAliases(objectEn: string, runner: Runner = defaultRunner(), terms: SiteTerm[] = [], crewLangs: Lang[] = []): Promise<string[]> {
  const more = crewLangs.filter(isBeta).map((l) => NAME[l]);
  const site = matchTerms(objectEn, terms).filter((t) => t.meanings.en.trim().toLowerCase() !== t.term.trim().toLowerCase()).map((t) => `On this site "${t.term}" means "${t.meanings.en}": give names for that, not for the everyday meaning of the word.`);
  const system = [
    "A construction-site supervisor names a thing in a task. List other names a worker might use for exactly the same thing.",
    "Include: English synonyms and trade names, the usual Hindi word in Devanagari, the same Hindi word in Roman letters (Hinglish), and the usual Tamil word in Tamil script.",
    "Also include loose everyday names workers really use for it even when technically imprecise (for steel rods: \"iron rods\", \"sariya\").",
    "Only names for the SAME thing: never a different material, a different size class, or a broader category (not \"material\", \"stuff\", \"items\").",
    ...(more.length ? [`Also include the usual ${more.join(" and ")} word, in its own script.`] : []),
    ...site,
    'Answer with JSON only: {"names":["..."]} with at most 12 short names, lower-case where the script has case.',
  ].join("\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const o = z.object({ names: z.array(z.string().min(1).max(60)).max(20) }).parse(parseJsonObject(await runner({ system, prompt: `Thing: ${objectEn}`, maxTokens: 300 })));
      return [...new Set(o.names.map((n) => n.trim()).filter(Boolean))].slice(0, 12);
    } catch { /* retry once, then no aliases */ }
  }
  return [];
}

// ---------- field extraction ----------
const ExtractionOut = ExtractionSchema.extend({ action: z.string(), place: z.string() });

/** Validate a raw model answer; list codes (A1, P2…) are mapped back to crew ids. Throws if invalid. */
export function parseExtraction(raw: string, actionCodes: Map<string, string>, placeCodes: Map<string, string>): Extraction {
  const o = ExtractionOut.parse(parseJsonObject(raw));
  const pick = (code: string, codes: Map<string, string>) => {
    const c = code.trim().toUpperCase();
    if (c === "UNKNOWN") return "unknown";
    const id = codes.get(c);
    if (!id) throw new Error(`code not in list: ${code}`);
    return id;
  };
  return ExtractionSchema.parse({ ...o, action: pick(o.action, actionCodes), place: pick(o.place, placeCodes) });
}

/** A beta-language worker's own language leads the list; for the three core languages the prompt is unchanged. */
const alsoWrites = (l: Lang) => (isBeta(l) ? `${NAME[l]}, ${NAME[l]} in Roman letters, ` : "");

const listing = (items: LabelledItem[], prefix: string) => {
  const codes = new Map<string, string>();
  const lines = items.map((it, i) => {
    codes.set(`${prefix}${i + 1}`, it.id);
    return `${prefix}${i + 1} = ${[...new Set(Object.values(it.labels))].join(" / ")}`;
  });
  return { codes, text: lines.join("\n") };
};

/**
 * Pull fields out of the worker's restatement. Never sees the supervisor's values.
 * null => the answer was invalid twice (or the AI is down): the card goes amber "couldn't check".
 */
export async function extractFields(text: string, language: Lang, actions: LabelledItem[], places: LabelledItem[], runner: Runner = defaultRunner()): Promise<Extraction | null> {
  const A = listing(actions, "A"), P = listing(places, "P");
  const system = [
    "You read a construction worker's restatement of an instruction and write down only what the worker said. Never guess or fill in missing parts.",
    `The worker may write ${alsoWrites(language)}Hindi, Hinglish (Hindi in Roman letters), Tamil, Tamil in Roman letters, or English.`,
    "Return JSON only, with exactly these keys:",
    '- action: the code from ACTIONS that matches the work the worker said, or "unknown".',
    '- object: a short English phrase for the thing being worked on ("cement bags", "bricks", "sand"), or null if not said. When it is counted in containers (bori, bag, katta, மூட்டை) phrase it as "<material> bags": "40 bori cement" => "cement bags".',
    '- object_maybe_same: true only when the worker\'s object word is vague or generic ("saamaan", "maal", "the stuff", "it", "woh"); otherwise false.',
    '- place: the code from PLACES the worker said, or "unknown" if not said or not in the list.',
    '- time: the time AS STATED, "HH:MM", or null if no time is said. A bare hour with no part-of-day word ("2 baje", "at 2", "2 மணி") => the hour as said, "02:00", with time_ambiguous true. With am/pm, a part-of-day word or a 24-hour time ("2 pm", "dopahar 2 baje", "shaam 5", "subah 9", "14:00", "மதியம் 2") => the exact 24-hour time with time_ambiguous false. "tak", "by", "before" do not change the time.',
    "- time_ambiguous: boolean as above (false when time is null).",
    '- quantity: a number, or null if not said. unit: a short English unit ("bags", "bricks", "kg", "trips"), or null.',
    "- gloss_en: one plain English sentence of what the worker said.",
    "",
    `ACTIONS:\n${A.text}`,
    `PLACES:\n${P.text}`,
  ].join("\n");
  const prompt = `Worker's language: ${language === "hi" ? "Hindi or Hinglish" : NAME[language]}\nRestatement:\n${text}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseExtraction(await runner({ system, prompt, maxTokens: 400 }), A.codes, P.codes);
    } catch { if (!attempt) await new Promise((r) => setTimeout(r, 1500)); /* invalid answer or AI busy: wait, one retry, then null */ }
  }
  return null;
}

/**
 * "Make this a task": an extraction of a chat message turned into form fields. The supervisor checks and sends;
 * nothing here creates a task. A bare hour follows the same work-hours rule as the comparison (resolveTime):
 * 1–6 => afternoon (time_assumed), 12 => noon, 7–11 => left empty because it cannot be settled.
 * null when nothing usable was found.
 */
export function draftFields(ex: Extraction | null): TaskDraft | null {
  if (!ex) return null;
  const r = ex.time ? resolveTime(ex.time, ex.time_ambiguous) : null;
  const d: TaskDraft = {
    action_id: ex.action === "unknown" ? null : ex.action,
    object_text: ex.object?.trim() && !ex.object_maybe_same ? ex.object.trim().slice(0, 80) : null,
    place_id: ex.place === "unknown" ? null : ex.place,
    due_time: r?.settled ?? null, time_assumed: Boolean(r?.settled && r.assumed),
    quantity: ex.quantity != null && ex.quantity > 0 ? ex.quantity : null,
    unit: ex.quantity != null && ex.quantity > 0 ? ex.unit?.trim().slice(0, 20) || null : null,
  };
  return d.action_id || d.object_text || d.place_id || d.due_time || d.quantity != null ? d : null;
}

// ---------- safety briefing: which listed safety points did the worker say? ----------
export type SafetyExtraction = { said: string[]; gloss_en: string };
const SafetyOut = z.object({ said: z.array(z.string()).max(50), gloss_en: z.string().min(1).max(300) });

/** Validate a raw answer; codes (S1, S2…) map back to point ids. Throws on a code outside the list. */
export function parseSafety(raw: string, codes: Map<string, string>): SafetyExtraction {
  const o = SafetyOut.parse(parseJsonObject(raw));
  const said = o.said.map((code) => {
    const id = codes.get(code.trim().toUpperCase());
    if (!id) throw new Error(`code not in list: ${code}`);
    return id;
  });
  return { said: [...new Set(said)], gloss_en: o.gloss_en };
}

/**
 * Read a worker's say-back of a safety briefing against the crew's WHOLE safety list. The model is never
 * told which points the supervisor picked, so it cannot be nudged into agreeing; code compares afterwards.
 * null => the answer was invalid twice (or the AI is down): the card says "couldn't check".
 */
export async function extractSafetyPoints(text: string, language: Lang, points: LabelledItem[], runner: Runner = defaultRunner()): Promise<SafetyExtraction | null> {
  const S = listing(points, "S");
  const system = [
    "A construction worker was told some site safety points and now says them back in their own words. Write down which of the listed safety points the worker clearly said.",
    `The worker may write ${alsoWrites(language)}Hindi, Hinglish (Hindi in Roman letters), Tamil, Tamil in Roman letters, or English, and may use very different words for the same point ("topi" or "sar ki suraksha" for the helmet, "belt" for the harness).`,
    "A point counts only when the worker clearly expressed its meaning. Do not count a point that is only hinted at, half said, or contradicted (\"no need for gloves\"). Never guess or fill in.",
    "Ignore anything the worker said that is not in the list.",
    'Return JSON only: {"said":["S1",...],"gloss_en":"<one plain English sentence of what the worker said>"}. "said" lists codes from SAFETY POINTS only, and may be empty.',
    "",
    `SAFETY POINTS:\n${S.text}`,
  ].join("\n");
  const prompt = `Worker's language: ${language === "hi" ? "Hindi or Hinglish" : NAME[language]}\nWhat the worker said:\n${text}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseSafety(await runner({ system, prompt, maxTokens: 300 }), S.codes);
    } catch { /* invalid answer or AI down: one retry, then null */ }
  }
  return null;
}

// ---------- readiness: a real tiny call, cached 60 s ----------
let probe: { at: number; ok: Promise<boolean> } | undefined;
export function aiReady(runner: Runner = defaultRunner()): Promise<boolean> {
  if (probe && Date.now() - probe.at < 60_000) return probe.ok;
  const ok = runner({ system: "", prompt: "Reply with the single word: ok", maxTokens: 16 }).then(() => true, () => false);
  probe = { at: Date.now(), ok };
  return ok;
}
