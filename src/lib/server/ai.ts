// Every model call lives here: translateText and extractFields (PRD "AI design").
// DB-free and alias-free so scripts/eval.mjs can import it with plain `node`.
// Only message text and crew list labels go to the model, never names or account data.
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import { ExtractionSchema, LangSchema, type Extraction, type Lang } from "../types.ts";

export type LabelledItem = { id: string; labels: Record<Lang, string> };
export type CrewLists = { places: LabelledItem[]; actions: LabelledItem[] };
export type ModelRequest = { system: string; prompt: string; maxTokens: number };
/** Injectable model call: returns the raw text answer, throws when the service fails. */
export type Runner = (req: ModelRequest) => Promise<string>;

export const AI_MODEL = process.env.AI_MODEL || "google/gemini-3.5-flash-lite";
const NAME: Record<Lang, string> = { en: "English", hi: "Hindi", ta: "Tamil" };

/**
 * Vercel AI Gateway via a plain model string (auth: VERCEL_OIDC_TOKEN or AI_GATEWAY_API_KEY).
 * If GOOGLE_GENERATIVE_AI_API_KEY is set, "google/..." models go straight to Google instead,
 * so the app runs without a card on the gateway account.
 */
export function gatewayRunner(model: string = AI_MODEL): Runner {
  const direct = process.env.GOOGLE_GENERATIVE_AI_API_KEY && model.startsWith("google/");
  return async ({ system, prompt, maxTokens }) => {
    const r = await generateText({
      model: direct ? google(model.slice("google/".length)) : model,
      instructions: system || undefined, prompt, temperature: 0,
      maxOutputTokens: maxTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(10_000),
    });
    return r.text;
  };
}
let dflt: Runner | undefined;
const defaultRunner = () => (dflt ??= gatewayRunner());

// ---------- very short replies: answered from a fixed list, no AI call ----------
const QUICK: { out: Record<Lang, string>; say: Record<Lang, string[]> }[] = [
  { out: { en: "OK", hi: "ठीक है", ta: "சரி" }, say: {
    en: ["ok", "okay", "okk", "k", "fine", "alright", "sure"],
    hi: ["theek hai", "thik hai", "theek h", "thik h", "tik hai", "acha", "achha", "accha", "ठीक है", "ठीक", "अच्छा", "ओके"],
    ta: ["sari", "seri", "saringa", "சரி", "சரிங்க"] } },
  { out: { en: "Yes", hi: "हाँ", ta: "ஆமா" }, say: {
    en: ["yes", "yeah", "yep", "ya"],
    hi: ["haan", "han", "haa", "haan ji", "haanji", "ji", "ji haan", "हाँ", "हां", "जी", "जी हाँ"],
    ta: ["aama", "aamaa", "aam", "ஆமா", "ஆம்", "ஆமாம்"] } },
  { out: { en: "No", hi: "नहीं", ta: "இல்லை" }, say: {
    en: ["no", "nope"], hi: ["nahi", "nahin", "nai", "na", "नहीं", "ना"], ta: ["illa", "illai", "இல்லை", "இல்ல"] } },
  { out: { en: "Thank you", hi: "धन्यवाद", ta: "நன்றி" }, say: {
    en: ["thanks", "thank you", "thx", "ty"], hi: ["dhanyavad", "dhanyawad", "shukriya", "धन्यवाद", "शुक्रिया"], ta: ["nandri", "nanri", "நன்றி"] } },
  { out: { en: "Done", hi: "हो गया", ta: "முடிஞ்சது" }, say: {
    en: ["done"], hi: ["ho gaya", "hogaya", "ho gya", "हो गया"], ta: ["mudinjathu", "mudinjidhu", "முடிஞ்சது", "முடிந்தது"] } },
  { out: { en: "Coming", hi: "आ रहा हूँ", ta: "வர்றேன்" }, say: {
    en: ["coming", "on my way"], hi: ["aa raha hoon", "aa raha hu", "aa rha hu", "आ रहा हूँ", "आ रहा हूं"], ta: ["varen", "varren", "வர்றேன்", "வருகிறேன்"] } },
];
const QUICK_INDEX = new Map<string, { out: Record<Lang, string>; lang: Lang }>();
for (const q of QUICK) for (const lang of ["en", "hi", "ta"] as Lang[]) for (const s of q.say[lang]) QUICK_INDEX.set(s, { out: q.out, lang });

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
  .replace(/[௦-௯]/g, (c) => String(c.charCodeAt(0) - 0xbe6));
/** Digit runs in `src` that do not appear as a whole run in `out`. */
export function missingNumbers(src: string, out: string): string[] {
  const have = new Set(asciiDigits(out).match(/\d+/g) ?? []);
  return (asciiDigits(src).match(/\d+/g) ?? []).filter((n) => !have.has(n));
}

/** Protected words: every spelling of a crew label maps to the reader's label. */
export function glossary(lists: CrewLists, target: Lang): string {
  return [...lists.places, ...lists.actions].map((it) => {
    const spellings = [...new Set(Object.values(it.labels))].join(" / ");
    return `${spellings} => ${it.labels[target]}`;
  }).join("\n");
}

/** First {...} block of a model answer, tolerating code fences or chatter around it. */
export function parseJsonObject(raw: string): unknown {
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no json");
  return JSON.parse(raw.slice(a, b + 1));
}

const TranslationOut = z.object({ source_lang: LangSchema, text: z.string().min(1) });

/**
 * Translate one chat message (or task text) for a reader.
 * null => already in the reader's language, show as is. Throws when the AI fails twice.
 */
export async function translateText(text: string, target: Lang, lists: CrewLists, runner: Runner = defaultRunner()): Promise<Translation | null> {
  if (!text.trim()) return null;
  const quick = quickTranslate(text, target);
  if (quick !== undefined) return quick;
  const system = [
    "You translate short work-chat messages between a construction-site supervisor and workers.",
    'Languages: "en" English, "hi" Hindi, "ta" Tamil. Hindi typed in Roman letters (Hinglish, e.g. "2 baje tak aa jaana") is Hindi: "hi". Tamil typed in Roman letters is "ta".',
    `Translate the message into ${NAME[target]} in its normal script. Keep it short, plain and in the same tone.`,
    "Keep every number, time and quantity exactly as written, using the digits 0-9. Keep people's names unchanged.",
    "When the message mentions a site word from the glossary, write exactly the label after =>.",
    `If the message is already in ${NAME[target]}, return it unchanged.`,
    'Answer with JSON only: {"source_lang":"en|hi|ta","text":"<translation>"}',
  ].join("\n");
  const prompt = `Glossary:\n${glossary(lists, target)}\n\nMessage:\n${text}`;
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = TranslationOut.parse(parseJsonObject(await runner({ system, prompt, maxTokens: 600 })));
      if (out.source_lang === target) return null;
      const lost = missingNumbers(text, out.text);
      if (lost.length) throw new Error(`numbers lost: ${lost.join(",")}`);
      return { text: out.text, source_lang: out.source_lang };
    } catch (e) { last = e; }
  }
  throw new Error(`translation failed: ${last instanceof Error ? last.message : String(last)}`);
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
    "The worker may write Hindi, Hinglish (Hindi in Roman letters), Tamil, Tamil in Roman letters, or English.",
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
