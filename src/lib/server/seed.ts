// Default crew lists (FR-3). Pure data: also imported by scripts/eval.mjs.
import type { BetaLang, CoreLang } from "../types.ts";

/** `beta`: labels for the beta languages, kept apart so prompts built from `labels` stay as they were. */
export type SeedItem = { key: string; labels: Record<CoreLang, string>; beta: Record<BetaLang, string> };

export const DEFAULT_PLACES: SeedItem[] = [
  { key: "gate1", labels: { en: "Gate 1", hi: "गेट 1", ta: "கேட் 1" }, beta: { bn: "গেট 1", te: "గేట్ 1", mr: "गेट 1" } },
  { key: "gate2", labels: { en: "Gate 2", hi: "गेट 2", ta: "கேட் 2" }, beta: { bn: "গেট 2", te: "గేట్ 2", mr: "गेट 2" } },
  { key: "gate3", labels: { en: "Gate 3", hi: "गेट 3", ta: "கேட் 3" }, beta: { bn: "গেট 3", te: "గేట్ 3", mr: "गेट 3" } },
  { key: "gate4", labels: { en: "Gate 4", hi: "गेट 4", ta: "கேட் 4" }, beta: { bn: "গেট 4", te: "గేట్ 4", mr: "गेट 4" } },
  { key: "store", labels: { en: "Store room", hi: "स्टोर रूम", ta: "ஸ்டோர் ரூம்" }, beta: { bn: "স্টোর রুম", te: "స్టోర్ రూమ్", mr: "स्टोअर रूम" } },
];

export const DEFAULT_ACTIONS: SeedItem[] = [
  { key: "unload", labels: { en: "Unload", hi: "उतारना", ta: "இறக்கு" }, beta: { bn: "নামানো", te: "దించు", mr: "उतरवणे" } },
  { key: "move", labels: { en: "Move", hi: "ले जाना", ta: "நகர்த்து" }, beta: { bn: "সরানো", te: "తరలించు", mr: "हलवणे" } },
  { key: "clean", labels: { en: "Clean", hi: "साफ़ करना", ta: "சுத்தம் செய்" }, beta: { bn: "পরিষ্কার করা", te: "శుభ్రం చేయి", mr: "साफ करणे" } },
  { key: "fix", labels: { en: "Fix", hi: "ठीक करना", ta: "சரி செய்" }, beta: { bn: "ঠিক করা", te: "బాగు చేయి", mr: "दुरुस्त करणे" } },
  { key: "deliver", labels: { en: "Deliver", hi: "पहुँचाना", ta: "கொண்டு சேர்" }, beta: { bn: "পৌঁছে দেওয়া", te: "చేర్చు", mr: "पोहोचवणे" } },
];
