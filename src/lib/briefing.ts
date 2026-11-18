// Safety briefing check: pure logic and data, no I/O (unit-tested in src/lib/briefing.test.ts).
// The AI only says which listed points the worker mentioned; everything decided here is plain code.
import type { BriefingRow, BriefingState, Lang } from "./types.ts";

export type SafetySeed = { key: string; labels: Record<Lang, string> };

/** Default safety points every crew starts with (the supervisor can add and remove on /crew). */
export const DEFAULT_SAFETY_POINTS: SafetySeed[] = [
  { key: "helmet", labels: { en: "Wear your helmet", hi: "हेलमेट पहनें", ta: "ஹெல்மெட் அணியுங்கள்" } },
  { key: "harness", labels: { en: "Wear the safety harness above 2 metres", hi: "2 मीटर से ऊपर सेफ़्टी बेल्ट (हार्नेस) पहनें", ta: "2 மீட்டருக்கு மேல் பாதுகாப்பு பெல்ட் (ஹார்னஸ்) அணியுங்கள்" } },
  { key: "gloves", labels: { en: "Wear gloves when handling cement", hi: "सीमेंट उठाते समय दस्ताने पहनें", ta: "சிமெண்ட் கையாளும்போது கையுறை அணியுங்கள்" } },
  { key: "shoes", labels: { en: "Wear safety shoes", hi: "सेफ़्टी जूते पहनें", ta: "பாதுகாப்புக் காலணி அணியுங்கள்" } },
  { key: "crane", labels: { en: "Keep clear of the crane's swing area", hi: "क्रेन के घूमने के दायरे से दूर रहें", ta: "கிரேன் சுழலும் பகுதியிலிருந்து விலகி இருங்கள்" } },
  { key: "phone", labels: { en: "No mobile phone while operating machines", hi: "मशीन चलाते समय मोबाइल फ़ोन नहीं", ta: "இயந்திரம் இயக்கும்போது கைப்பேசி கூடாது" } },
  { key: "scaffold", labels: { en: "Check the scaffolding tag before climbing", hi: "चढ़ने से पहले मचान (पाड़) का टैग देखें", ta: "ஏறும் முன் சாரத்தின் அட்டையைச் சரிபாருங்கள்" } },
  { key: "wire", labels: { en: "Report any exposed wire at once", hi: "खुला तार दिखे तो तुरंत बताएँ", ta: "வெளியே தெரியும் மின்கம்பியை உடனே சொல்லுங்கள்" } },
];

/** One-tap templates: default point keys. A crew that removed a point just gets the ones that still exist. */
export const PRESETS = [
  { id: "height", keys: ["helmet", "harness", "scaffold", "shoes"] },
  { id: "lifting", keys: ["helmet", "crane", "shoes", "phone"] },
  { id: "electrical", keys: ["wire", "shoes", "helmet"] },
] as const;
export const MIN_POINTS = 2, MAX_POINTS = 5;

/** Ids of the crew's points that a template selects, in list order, at most MAX_POINTS. */
export function presetPick(keys: readonly string[], points: { id: string; key: string | null }[]): string[] {
  return points.filter((p) => p.key && keys.includes(p.key)).map((p) => p.id).slice(0, MAX_POINTS);
}

export type BriefingResult = {
  said: string[];      // picked points the worker has said (any reply so far), in briefing order
  missing: string[];   // picked points not said yet, in briefing order
  extra: string[];     // listed points the worker mentioned that were not in today's briefing: shown neutrally, never counted
  all: boolean;
};

/** Plain set comparison: every picked point must be in the said set. */
export function compareBriefing(picked: string[], saidSoFar: string[]): BriefingResult {
  const s = new Set(saidSoFar), p = new Set(picked);
  const said = picked.filter((id) => s.has(id));
  const missing = picked.filter((id) => !s.has(id));
  return { said, missing, extra: [...s].filter((id) => !p.has(id)), all: picked.length > 0 && missing.length === 0 };
}

/** Points said across every reply so far (a point said once stays said), first-said order. */
export const unionSaid = (before: string[], now: string[]) => [...new Set([...before, ...now])];

/** State after a reply. An unreadable reply (AI could not check) changes nothing. */
export function nextState(prev: BriefingState, r: BriefingResult | null): BriefingState {
  if (prev === "understood") return prev;
  return r == null ? prev : r.all ? "understood" : "missed";
}

export type RollItem = {
  worker: { id: string; name: string; language: Lang };
  state: BriefingState; conversation_id: string;
  said: string[]; missing: string[];
};

/**
 * Roll-call rows in the reader's view plus progress. Same rule as the crew-task board: the supervisor
 * sees every row in full; a worker sees their own row in full and every other row only as
 * "understood" or "not_yet", with no points, counts or chat ids.
 */
export function rollCallView(items: RollItem[], reader: { id: string; role: "supervisor" | "worker" }): {
  rows: BriefingRow[]; progress: { understood: number; total: number }; redacted: boolean;
} {
  const redacted = reader.role !== "supervisor";
  const rows = [...items]
    .sort((a, b) => a.worker.name.localeCompare(b.worker.name))
    .map((it): BriefingRow => {
      const is_me = it.worker.id === reader.id;
      if (redacted && !is_me) {
        return { worker: it.worker, status: it.state === "understood" ? "understood" : "not_yet", is_me, said: null, missing: [], conversation_id: null };
      }
      return { worker: it.worker, status: it.state, is_me, said: it.said.length, missing: it.missing, conversation_id: it.conversation_id };
    });
  if (redacted) rows.sort((a, b) => Number(b.is_me) - Number(a.is_me)); // my own row first
  return { rows, progress: { understood: items.filter((i) => i.state === "understood").length, total: items.length }, redacted };
}
