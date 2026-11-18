// Common site units in the reader's language. Unknown units are shown as typed.
import type { BetaLang, Lang } from "./types.ts";

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

// Beta languages: only words in everyday site use; anything else is shown as typed (English).
const BETA: Record<BetaLang, Record<string, string>> = { bn: {}, te: {}, mr: {} };
for (const [keys, bn, te, mr] of [
  ["bag sack", "বস্তা", "బస్తా", "गोणी"], ["bags sacks", "বস্তা", "బస్తాలు", "गोण्या"],
  ["box", "বাক্স", "పెట్టె", "बॉक्स"], ["boxes", "বাক্স", "పెట్టెలు", "बॉक्स"],
  ["piece", "পিস", "పీస్", "पीस"], ["pieces pcs", "পিস", "పీసులు", "पीस"],
  ["rod", "রড", "రాడ్", "रॉड"], ["rods", "রড", "రాడ్లు", "रॉड"],
  ["brick", "ইট", "ఇటుక", "वीट"], ["bricks", "ইট", "ఇటుకలు", "विटा"],
  ["drum", "ড্রাম", "డ్రమ్", "ड्रम"], ["drums", "ড্রাম", "డ్రమ్ములు", "ड्रम"],
  ["bucket", "বালতি", "బకెట్", "बादली"], ["buckets", "বালতি", "బకెట్లు", "बादल्या"],
  ["sheet", "শিট", "షీట్", "शीट"], ["sheets", "শিট", "షీట్లు", "शीट"],
  ["trip", "ট্রিপ", "ట్రిప్", "फेरी"], ["trips", "ট্রিপ", "ట్రిప్పులు", "फेऱ्या"],
  ["kg", "কেজি", "కిలో", "किलो"], ["litre", "লিটার", "లీటర్", "लिटर"], ["litres liters", "লিটার", "లీటర్లు", "लिटर"],
  ["metre", "মিটার", "మీటర్", "मीटर"], ["metres meters", "মিটার", "మీటర్లు", "मीटर"],
  ["helmet", "হেলমেট", "హెల్మెట్", "हेल्मेट"], ["helmets", "হেলমেট", "హెల్మెట్లు", "हेल्मेट"],
  ["load", "লোড", "లోడ్", "लोड"], ["loads", "লোড", "లోడ్లు", "लोड"],
]) for (const k of keys.split(" ")) { BETA.bn[k] = bn; BETA.te[k] = te; BETA.mr[k] = mr; }

export function localUnit(unit: string | null, lang: Lang): string | null {
  if (!unit || lang === "en") return unit;
  const k = unit.trim().toLowerCase();
  return (lang === "hi" || lang === "ta" ? U[k]?.[lang] : BETA[lang][k]) ?? unit;
}

/** "40 bags" -> "40 बोरियाँ" for a Hindi reader. Anything that is not "<number> <unit>" is returned unchanged. */
export function localQty(text: string, lang: Lang): string {
  const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(text.trim());
  return m ? `${m[1]} ${localUnit(m[2], lang)}` : text;
}
