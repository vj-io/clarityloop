// Default crew lists (FR-3). Pure data: also imported by scripts/eval.mjs.
import type { Lang } from "../types.ts";

export type SeedItem = { key: string; labels: Record<Lang, string> };

export const DEFAULT_PLACES: SeedItem[] = [
  { key: "gate1", labels: { en: "Gate 1", hi: "गेट 1", ta: "கேட் 1" } },
  { key: "gate2", labels: { en: "Gate 2", hi: "गेट 2", ta: "கேட் 2" } },
  { key: "gate3", labels: { en: "Gate 3", hi: "गेट 3", ta: "கேட் 3" } },
  { key: "gate4", labels: { en: "Gate 4", hi: "गेट 4", ta: "கேட் 4" } },
  { key: "store", labels: { en: "Store room", hi: "स्टोर रूम", ta: "ஸ்டோர் ரூம்" } },
];

export const DEFAULT_ACTIONS: SeedItem[] = [
  { key: "unload", labels: { en: "Unload", hi: "उतारना", ta: "இறக்கு" } },
  { key: "move", labels: { en: "Move", hi: "ले जाना", ta: "நகர்த்து" } },
  { key: "clean", labels: { en: "Clean", hi: "साफ़ करना", ta: "சுத்தம் செய்" } },
  { key: "fix", labels: { en: "Fix", hi: "ठीक करना", ta: "சரி செய்" } },
  { key: "deliver", labels: { en: "Deliver", hi: "पहुँचाना", ta: "கொண்டு சேர்" } },
];
