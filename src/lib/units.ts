// Common site units in the reader's language. Unknown units are shown as typed.
import type { Lang } from "./types.ts";

const U: Record<string, { hi: string; ta: string }> = {
  bag: { hi: "बोरी", ta: "மூட்டை" }, bags: { hi: "बोरियाँ", ta: "மூட்டைகள்" },
  sack: { hi: "बोरी", ta: "மூட்டை" }, sacks: { hi: "बोरियाँ", ta: "மூட்டைகள்" },
  box: { hi: "डिब्बा", ta: "பெட்டி" }, boxes: { hi: "डिब्बे", ta: "பெட்டிகள்" },
  piece: { hi: "पीस", ta: "துண்டு" }, pieces: { hi: "पीस", ta: "துண்டுகள்" }, pcs: { hi: "पीस", ta: "துண்டுகள்" },
  rod: { hi: "छड़", ta: "கம்பி" }, rods: { hi: "छड़ें", ta: "கம்பிகள்" },
  brick: { hi: "ईंट", ta: "செங்கல்" }, bricks: { hi: "ईंटें", ta: "செங்கற்கள்" },
  drum: { hi: "ड्रम", ta: "டிரம்" }, drums: { hi: "ड्रम", ta: "டிரம்கள்" },
  bucket: { hi: "बाल्टी", ta: "வாளி" }, buckets: { hi: "बाल्टियाँ", ta: "வாளிகள்" },
  sheet: { hi: "शीट", ta: "தகடு" }, sheets: { hi: "शीटें", ta: "தகடுகள்" },
  trip: { hi: "चक्कर", ta: "தடவை" }, trips: { hi: "चक्कर", ta: "தடவைகள்" },
  kg: { hi: "किलो", ta: "கிலோ" }, litre: { hi: "लीटर", ta: "லிட்டர்" }, litres: { hi: "लीटर", ta: "லிட்டர்" }, liters: { hi: "लीटर", ta: "லிட்டர்" },
  metre: { hi: "मीटर", ta: "மீட்டர்" }, metres: { hi: "मीटर", ta: "மீட்டர்" }, meters: { hi: "मीटर", ta: "மீட்டர்" },
  helmet: { hi: "हेलमेट", ta: "தலைக்கவசம்" }, helmets: { hi: "हेलमेट", ta: "தலைக்கவசங்கள்" },
  bundle: { hi: "गट्ठर", ta: "கட்டு" }, bundles: { hi: "गट्ठर", ta: "கட்டுகள்" },
  load: { hi: "खेप", ta: "லோடு" }, loads: { hi: "खेप", ta: "லோடுகள்" },
};

export function localUnit(unit: string | null, lang: Lang): string | null {
  if (!unit || lang === "en") return unit;
  return U[unit.trim().toLowerCase()]?.[lang] ?? unit;
}

/** "40 bags" -> "40 बोरियाँ" for a Hindi reader. Anything that is not "<number> <unit>" is returned unchanged. */
export function localQty(text: string, lang: Lang): string {
  const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(text.trim());
  return m ? `${m[1]} ${localUnit(m[2], lang)}` : text;
}
