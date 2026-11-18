// Site words, "Make this a task" drafts, reminder gap. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftFields, matchTerms, translateText, type CrewLists, type ModelRequest, type Runner, type SiteTerm } from "./server/ai.ts";
import { cachedIsStale } from "./server/terms.ts";
import { NUDGE_GAP_MS, nudgeWait, type Extraction } from "./types.ts";

const T = (term: string): SiteTerm => ({ term, meanings: { en: `${term}-en`, hi: `${term}-hi`, ta: `${term}-ta` } });
const words = (text: string, terms: SiteTerm[]) => matchTerms(text, terms).map((t) => t.term);

test("site words: Latin terms match whole words, any case, with a plural", () => {
  const terms = [T("JCB"), T("sariya"), T("RMC"), T("store")];
  assert.deepEqual(words("jcb ko gate pe lao", terms), ["JCB"]);
  assert.deepEqual(words("Two JCBs today, and 40 SARIYA bundles.", terms), ["JCB", "sariya"]);
  assert.deepEqual(words("restore the storeroom", terms), []);               // not inside another word
  assert.deepEqual(words("RMC truck at 3", terms), ["RMC"]);
  assert.deepEqual(words("send it to the store.", terms), ["store"]);
  assert.deepEqual(words("nothing here", terms), []);
});

test("site words: Devanagari and Tamil match at a word start; Tamil endings may attach", () => {
  const terms = [T("सरिया"), T("மேஸ்திரி"), T("R.M.C")];
  assert.deepEqual(words("सरिया को ऊपर ले जाओ", terms), ["सरिया"]);
  assert.deepEqual(words("गोदाम-सरिया", terms), ["सरिया"]);              // hyphen is a word edge
  assert.deepEqual(words("कसरिया", terms), []);                          // not a word start
  assert.deepEqual(words("மேஸ்திரியிடம் சொல்லுங்கள்", terms), ["மேஸ்திரி"]);  // "to the mason" — suffix attached
  assert.deepEqual(words("r.m.c wala aaya", terms), ["R.M.C"]);           // regex characters are literal
  assert.deepEqual(words("rxmxc", terms), []);
});

test("stale cache: only an older row whose message contains a current site word is re-made", () => {
  const terms = [T("shuttering")];
  assert.equal(cachedIsStale(0, 1, "shuttering kal khol dena", terms), true);
  assert.equal(cachedIsStale(null, 1, "Shuttering kal", terms), true);    // rows from before site words existed
  assert.equal(cachedIsStale(1, 1, "shuttering kal", terms), false);      // made under the current glossary
  assert.equal(cachedIsStale(0, 3, "cement 40 bags", terms), false);      // no site word: keep the cached text
  assert.equal(cachedIsStale(undefined, 0, "shuttering", terms), false);  // crew never changed its glossary
});

const lists: CrewLists = { places: [{ id: "p1", labels: { en: "Gate 2", hi: "गेट 2", ta: "கேட் 2" } }], actions: [] };
function fake(answer: string) {
  const calls: ModelRequest[] = [];
  const run: Runner = async (req) => { calls.push(req); return answer; };
  return { run, calls };
}

test("translateText: only matching site words are sent, in their own block; callers without terms are unchanged", async () => {
  const f = fake('{"source_lang":"hi","text":"Take the steel bars to Gate 2"}');
  await translateText("sariya Gate 2 pe le jao", "en", lists, f.run, [T("sariya"), T("JCB")]);
  assert.match(f.calls[0].prompt, /Site words[^\n]*\n"sariya" means "sariya-en"/);
  assert.doesNotMatch(f.calls[0].prompt, /JCB/);
  const g = fake('{"source_lang":"hi","text":"Take it to Gate 2"}');
  await translateText("Gate 2 pe le jao", "en", lists, g.run);
  assert.doesNotMatch(g.calls[0].prompt, /Site words/);
  const h = fake('{"source_lang":"hi","text":"Take it to Gate 2"}');
  await translateText("Gate 2 pe le jao", "en", lists, h.run, [T("JCB")]);
  assert.equal(h.calls[0].prompt, g.calls[0].prompt);                     // no match: prompt identical to before
});

const ex = (o: Partial<Extraction>): Extraction => ({
  action: "unknown", object: null, object_maybe_same: false, place: "unknown", time: null, time_ambiguous: false,
  quantity: null, unit: null, gloss_en: "x", ...o,
});

test("draft: extraction mapped to form fields; unknown and vague parts left empty", () => {
  assert.deepEqual(draftFields(ex({ action: "a1", object: "cement bags", place: "p1", time: "14:00", quantity: 40, unit: "bags" })), {
    action_id: "a1", object_text: "cement bags", place_id: "p1", due_time: "14:00", time_assumed: false, quantity: 40, unit: "bags",
  });
  assert.equal(draftFields(ex({ object: "saamaan", object_maybe_same: true })), null);   // vague object only: nothing to fill
  assert.equal(draftFields(null), null);                                               // AI down or invalid twice
  assert.equal(draftFields(ex({})), null);
  assert.deepEqual(draftFields(ex({ place: "p1", quantity: 0, unit: "bags" })), {
    action_id: null, object_text: null, place_id: "p1", due_time: null, time_assumed: false, quantity: null, unit: null,
  });
});

test("draft: bare hours follow the work-hours rule", () => {
  const d = (time: string, amb: boolean) => draftFields(ex({ place: "p1", time, time_ambiguous: amb }))!;
  assert.deepEqual([d("02:00", true).due_time, d("02:00", true).time_assumed], ["14:00", true]);   // "2 baje" => afternoon, marked
  assert.deepEqual([d("12:00", true).due_time, d("12:00", true).time_assumed], ["12:00", false]);  // noon
  assert.equal(d("09:00", true).due_time, null);                                                 // 9 am or 9 pm: cannot settle
  assert.deepEqual([d("09:00", false).due_time, d("09:00", false).time_assumed], ["09:00", false]); // "subah 9"
});

test("reminder gap: one per task per 10 minutes", () => {
  const now = Date.parse("2026-11-18T10:00:00Z");
  assert.equal(nudgeWait(null, now), 0);
  assert.equal(nudgeWait(new Date(now - NUDGE_GAP_MS).toISOString(), now), 0);
  assert.equal(nudgeWait(new Date(now - 4 * 60_000).toISOString(), now), 360);
  assert.equal(nudgeWait(new Date(now - 1000).toISOString(), now), 599);
});
