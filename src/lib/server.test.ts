// Server pure logic: AI wrappers with a fake runner, PIN hashing. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFields, glossary, missingNumbers, quickTranslate, translateText,
  type CrewLists, type ModelRequest, type Runner,
} from "./server/ai.ts";
import { hashPin, verifyPin } from "./server/pin.ts";
import { DEFAULT_ACTIONS, DEFAULT_PLACES } from "./server/seed.ts";

const lists: CrewLists = {
  places: DEFAULT_PLACES.map((p) => ({ id: p.key, labels: p.labels })),
  actions: DEFAULT_ACTIONS.map((a) => ({ id: a.key, labels: a.labels })),
};
/** Fake model: answers in order, records every request. */
function fake(...answers: (string | Error)[]) {
  const calls: ModelRequest[] = [];
  const run: Runner = async (req) => {
    calls.push(req);
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return a;
  };
  return { run, calls };
}
const never: Runner = async () => { throw new Error("must not call the model"); };

test("quick words answer without the model, by detected language", async () => {
  assert.deepEqual(await translateText("Theek hai", "en", lists, never), { text: "OK", source_lang: "hi" });
  assert.deepEqual(await translateText("ok!", "ta", lists, never), { text: "சரி", source_lang: "en" });
  assert.equal(await translateText("haan", "hi", lists, never), null);       // same language
  assert.equal(await translateText("👍", "hi", lists, never), null);          // emoji only
  assert.equal(quickTranslate("theek hai sir, kahan?", "en"), undefined);    // a sentence goes to the model
});

test("digit runs: Devanagari/Tamil digits count, partial runs do not", () => {
  assert.deepEqual(missingNumbers("40 bori, 2 baje", "४० bags at 2"), []);
  assert.deepEqual(missingNumbers("Gate 3 at 14:00", "गेट 3, 2 बजे"), ["14", "00"]);
  assert.deepEqual(missingNumbers("2 baje", "12 o'clock"), ["2"]);
});

test("glossary maps every spelling of a crew label to the reader's label", () => {
  const g = glossary(lists, "hi");
  assert.match(g, /^Gate 3 \/ गेट 3 \/ கேட் 3 => गेट 3$/m);
  assert.match(g, /^Unload \/ उतारना \/ இறக்கு => उतारना$/m);
});

test("translate: sends text + glossary only, returns detected source", async () => {
  const f = fake('```json\n{"source_lang":"hi","text":"Unload 40 bags at Gate 3 by 2"}\n```');
  const r = await translateText("40 bori Gate 3 pe utaarna hai, 2 baje tak", "en", lists, f.run);
  assert.deepEqual(r, { text: "Unload 40 bags at Gate 3 by 2", source_lang: "hi" });
  assert.match(f.calls[0].prompt, /Gate 3 \/ गेट 3 \/ கேட் 3 => Gate 3/);
  assert.match(f.calls[0].system, /Hinglish/);
});

test("translate: detected same language => null", async () => {
  assert.equal(await translateText("Cement truck arrives at 1", "en", lists, fake('{"source_lang":"en","text":"x 1"}').run), null);
});

test("translate: lost number retries once, then fails", async () => {
  const ok = fake('{"source_lang":"en","text":"ट्रक 2 बजे"}', '{"source_lang":"en","text":"ट्रक 1 बजे आएगा"}');
  assert.equal((await translateText("Truck comes at 1", "hi", lists, ok.run))?.text, "ट्रक 1 बजे आएगा");
  assert.equal(ok.calls.length, 2);
  const bad = fake('{"source_lang":"en","text":"ट्रक आएगा"}');
  await assert.rejects(translateText("Truck comes at 1", "hi", lists, bad.run), /numbers lost/);
  assert.equal(bad.calls.length, 2);
  await assert.rejects(translateText("Truck comes at 1", "hi", lists, fake(new Error("gateway 402")).run), /gateway 402/);
});

const good = { action: "A1", object: "cement bags", object_maybe_same: false, place: "P2", time: "02:00", time_ambiguous: true, quantity: 40, unit: "bags", gloss_en: "Unload 40 cement bags at Gate 2 by 2." };

test("extract: codes map back to crew ids; supervisor values never sent", async () => {
  const f = fake(JSON.stringify(good));
  const ex = await extractFields("40 bori cement Gate 2 pe utaarna hai, 2 baje tak", "hi", lists.actions, lists.places, f.run);
  assert.equal(ex?.action, "unload");
  assert.equal(ex?.place, "gate2");
  assert.equal(ex?.time, "02:00");
  assert.match(f.calls[0].system, /A1 = Unload \/ उतारना \/ இறக்கு/);
  // the signature takes no task: the prompt is the language hint + the worker's words only
  assert.equal(f.calls[0].prompt, "Worker's language: Hindi or Hinglish\nRestatement:\n40 bori cement Gate 2 pe utaarna hai, 2 baje tak");
});

test("extract: unknown is allowed; ids outside the list are invalid", async () => {
  assert.equal((await extractFields("x", "en", lists.actions, lists.places, fake(JSON.stringify({ ...good, place: "unknown" })).run))?.place, "unknown");
  const f = fake(JSON.stringify({ ...good, place: "P9" }), JSON.stringify({ ...good, place: "gate2" }));
  assert.equal(await extractFields("x", "en", lists.actions, lists.places, f.run), null);
  assert.equal(f.calls.length, 2);
});

test("extract: one retry after an invalid answer, then null; AI down => null", async () => {
  const retry = fake("sorry I can't", JSON.stringify(good));
  assert.equal((await extractFields("x", "en", lists.actions, lists.places, retry.run))?.quantity, 40);
  assert.equal(retry.calls.length, 2);
  const bad = fake(JSON.stringify({ ...good, time: "2 pm" }));      // schema: HH:MM only
  assert.equal(await extractFields("x", "en", lists.actions, lists.places, bad.run), null);
  assert.equal(bad.calls.length, 2);
  assert.equal(await extractFields("x", "en", lists.actions, lists.places, fake(new Error("402")).run), null);
});

test("PIN: hashed with a per-user salt, verified, wrong PIN rejected", () => {
  const a = hashPin("1234"), b = hashPin("1234");
  assert.notEqual(a, b);
  assert.ok(!a.includes("1234"));
  assert.ok(verifyPin("1234", a));
  assert.ok(!verifyPin("1235", a));
  assert.ok(!verifyPin("1234", null));
});
