// Beta languages (Bengali, Telugu, Marathi): fallbacks, label building, translation targets, script guards. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeT } from "./i18n.ts";
import { inLang, LANGS, LangSchema } from "./types.ts";
import { localQty, localUnit } from "./units.ts";
import { extractFields, glossary, inScript, missingNumbers, quickTranslate, translationTargets, translateText, type ModelRequest } from "./server/ai.ts";
import { betaOnly, labelsOf } from "./server/crew.ts";
import { DEFAULT_ACTIONS, DEFAULT_PLACES } from "./server/seed.ts";
import { DEFAULT_SAFETY_POINTS } from "./briefing.ts";

test("languages: three core, three beta, all accepted by the API schema", () => {
  assert.deepEqual([...LANGS], ["en", "hi", "ta", "bn", "te", "mr"]);
  assert.equal(LangSchema.safeParse("te").success, true);
  assert.equal(LangSchema.safeParse("fr").success, false);
});

test("makeT: a beta language uses its own file, then English, then the key; core languages are untouched", () => {
  assert.equal(makeT("te")("lang.beta"), "బీటా");
  assert.notEqual(makeT("te")("nav.signout"), makeT("en")("nav.signout"));   // written in Telugu
  assert.equal(makeT("bn")("no.such.key"), "no.such.key");
  assert.equal(makeT("hi")("lang.beta"), "बीटा");
  assert.notEqual(makeT("ta")("nav.signout"), makeT("en")("nav.signout"));
  assert.match(makeT("mr")("time.min", { n: 5 }), /5/);   // placeholders filled
});

test("labels: core columns plus the beta jsonb; a missing beta entry reads as English", () => {
  const row = { label_en: "Gate 1", label_hi: "गेट 1", label_ta: "கேட் 1" };
  assert.deepEqual(labelsOf(row), { en: "Gate 1", hi: "गेट 1", ta: "கேட் 1" });
  assert.deepEqual(labelsOf({ ...row, labels_beta: null }), { en: "Gate 1", hi: "गेट 1", ta: "கேட் 1" });
  const l = labelsOf({ ...row, labels_beta: { te: "గేట్ 1" } });
  assert.equal(inLang(l, "te"), "గేట్ 1");
  assert.equal(inLang(l, "bn"), "Gate 1");
  assert.equal(inLang(l, "ta"), "கேட் 1");
  // a beta entry can never replace a core column
  assert.equal(labelsOf({ ...row, labels_beta: { en: "x" } as never }).en, "Gate 1");
  assert.deepEqual(betaOnly({ en: "Store", hi: "स्टोर", te: "స్టోర్", bn: "" }), { te: "స్టోర్" });
});

test("seed defaults carry all three beta labels, each in its own script", () => {
  for (const s of [...DEFAULT_PLACES, ...DEFAULT_ACTIONS, ...DEFAULT_SAFETY_POINTS]) {
    assert.match(s.beta.bn, /[ঀ-৿]/, s.key);
    assert.match(s.beta.te, /[ఀ-౿]/, s.key);
    assert.match(s.beta.mr, /[ऀ-ॿ]/, s.key);
    assert.deepEqual(missingNumbers(s.labels.en, s.beta.bn + s.beta.te + s.beta.mr).length, 0, s.key);
  }
});

test("translation targets: English plus what the crew reads, nothing else", () => {
  assert.deepEqual(translationTargets(["hi", "te", "hi"]), ["en", "hi", "te"]);
  assert.deepEqual(translationTargets([]), ["en"]);
  assert.deepEqual(translationTargets(["en", "hi", "ta"]), ["en", "hi", "ta"]);                    // the demo crew: as before
  assert.deepEqual(translationTargets(["te"], ["en", "hi", "ta"]), ["en", "hi", "ta", "te"]);      // stored lists keep the core three
});

test("script guard and digits for Bengali, Telugu and Marathi", () => {
  assert.equal(inScript("గేట్ 2 దగ్గర 40 బస్తాలు దించు", "te"), true);
  assert.equal(inScript("Unload 40 bags at Gate 2", "te"), false);
  assert.equal(inScript("गेट 2 पर 40 बोरियाँ उतारो", "te"), false);
  assert.equal(inScript("গেট 2-এ 40 বস্তা নামাও", "bn"), true);
  assert.equal(inScript("గేట్ 2 దగ్గర దించు", "bn"), false);
  assert.equal(inScript("गेट 2 वर 40 गोण्या उतरवा", "mr"), true);
  assert.equal(inScript("Unload at Gate 2 now", "mr"), false);
  assert.deepEqual(missingNumbers("40 bags by 2", "৪০ বস্তা, ২টা"), []);
  assert.deepEqual(missingNumbers("40 bags by 2", "౪౦ బస్తాలు, ౨ గంటలకు"), []);
  assert.deepEqual(missingNumbers("40 bags", "బస్తాలు"), ["40"]);
});

test("quick words reach a beta reader without the model", () => {
  assert.deepEqual(quickTranslate("ok", "te"), { text: "సరే", source_lang: "en" });
  assert.deepEqual(quickTranslate("theek hai", "bn"), { text: "ঠিক আছে", source_lang: "hi" });
});

const lists = { places: DEFAULT_PLACES.map((p) => ({ id: p.key, labels: p.labels })), actions: DEFAULT_ACTIONS.map((a) => ({ id: a.key, labels: a.labels })) };

test("glossary for a beta reader: their label where the crew has one, English otherwise", () => {
  assert.match(glossary(lists, "te"), /^"Gate 3" or "गेट 3" or "கேட் 3" is written "Gate 3"$/m);
  const withTe = { places: [{ id: "p", labels: { ...DEFAULT_PLACES[2].labels, te: DEFAULT_PLACES[2].beta.te } }], actions: [] };
  assert.match(glossary(withTe, "te"), /^"Gate 3" or "गेट 3" or "கேட் 3" or "గేట్ 3" is written "గేట్ 3"$/m);
});

test("prompts: a Telugu say-back names Telugu; Hindi and Tamil prompts do not change", async () => {
  const calls: ModelRequest[] = [];
  const run = async (r: ModelRequest) => { calls.push(r); return '{"action":"A1","object":"cement bags","object_maybe_same":false,"place":"P2","time":null,"time_ambiguous":false,"quantity":40,"unit":"bags","gloss_en":"x"}'; };
  await extractFields("గేట్ 2 దగ్గర 40 సిమెంట్ బస్తాలు దించాలి", "te", lists.actions, lists.places, run);
  await extractFields("gate 2 pe 40 bori utaarni hai", "hi", lists.actions, lists.places, run);
  assert.match(calls[0].system, /may write Telugu, Telugu in Roman letters, Hindi, Hinglish/);
  assert.match(calls[0].prompt, /^Worker's language: Telugu$/m);
  assert.match(calls[1].system, /^The worker may write Hindi, Hinglish \(Hindi in Roman letters\), Tamil, Tamil in Roman letters, or English\.$/m);
  assert.doesNotMatch(calls[1].system, /Telugu|Bengali|Marathi/);
});

test("translate into Telugu: an answer left in English is refused, then retried", async () => {
  const answers = ['{"source_lang":"en","text":"Unload 40 bags at Gate 2"}', '{"source_lang":"en","text":"గేట్ 2 దగ్గర 40 బస్తాలు దించండి"}'];
  let n = 0;
  const r = await translateText("Unload 40 bags at Gate 2", "te", lists, async () => answers[n++]);
  assert.deepEqual(r, { text: "గేట్ 2 దగ్గర 40 బస్తాలు దించండి", source_lang: "en" });
  assert.equal(n, 2);
});

test("units: beta readers get a site word where one is listed, the typed unit otherwise", () => {
  assert.equal(localQty("40 bags", "te"), "40 బస్తాలు");
  assert.equal(localQty("40 bags", "bn"), "40 বস্তা");
  assert.equal(localQty("40 bags", "mr"), "40 गोण्या");
  assert.equal(localUnit("bundles", "te"), "bundles");
  assert.equal(localQty("40 bags", "hi"), "40 बोरियाँ");
  assert.equal(localUnit("pallets", "mr"), "pallets");
});
