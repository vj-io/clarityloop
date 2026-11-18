// Safety briefing check: set comparison, progress, redaction, templates, extraction with a fake model. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SAFETY_POINTS, PRESETS, compareBriefing, nextState, presetPick, rollCallView, unionSaid, type RollItem,
} from "./briefing.ts";
import { extractSafetyPoints, parseSafety, type ModelRequest, type Runner } from "./server/ai.ts";
import { CARD, parseCard } from "./types.ts";

const points = DEFAULT_SAFETY_POINTS.map((p) => ({ id: p.key, labels: p.labels }));   // S1 helmet … S8 wire

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

test("compare: every picked point must be said; extras never count against the worker", () => {
  const r = compareBriefing(["helmet", "harness", "scaffold"], ["scaffold", "helmet", "phone"]);
  assert.deepEqual(r.said, ["helmet", "scaffold"]);            // briefing order
  assert.deepEqual(r.missing, ["harness"]);
  assert.deepEqual(r.extra, ["phone"]);
  assert.equal(r.all, false);
  const ok = compareBriefing(["helmet", "harness"], ["harness", "helmet", "wire"]);
  assert.equal(ok.all, true);
  assert.deepEqual(ok.extra, ["wire"]);
  assert.equal(compareBriefing(["helmet"], []).all, false);
  assert.equal(compareBriefing([], ["helmet"]).all, false);    // nothing picked is never "understood"
});

test("points said in an earlier reply stay said; an unreadable reply changes nothing", () => {
  const first = unionSaid([], ["helmet", "scaffold"]);
  assert.equal(nextState("waiting", compareBriefing(["helmet", "harness", "scaffold"], first)), "missed");
  const second = unionSaid(first, ["harness"]);
  assert.deepEqual(second, ["helmet", "scaffold", "harness"]);
  assert.equal(nextState("missed", compareBriefing(["helmet", "harness", "scaffold"], second)), "understood");
  assert.equal(nextState("missed", null), "missed");
  assert.equal(nextState("waiting", null), "waiting");
  assert.equal(nextState("understood", compareBriefing(["helmet"], [])), "understood");
});

const item = (id: string, name: string, state: RollItem["state"], said: string[] = [], missing: string[] = []): RollItem => ({
  worker: { id, name, language: "hi" }, state, conversation_id: `c-${id}`, said, missing,
});
const crew = [item("m", "Murugan", "missed", ["helmet"], ["harness"]), item("l", "Lakshmi", "understood", ["helmet", "harness"]), item("i", "Imran", "waiting", [], ["helmet", "harness"])];

test("roll call: the supervisor sees every row with the points still missing", () => {
  const v = rollCallView(crew, { id: "sup", role: "supervisor" });
  assert.equal(v.redacted, false);
  assert.deepEqual(v.rows.map((r) => r.worker.name), ["Imran", "Lakshmi", "Murugan"]);
  const m = v.rows.find((r) => r.worker.id === "m")!;
  assert.equal(m.status, "missed");
  assert.equal(m.said, 1);
  assert.deepEqual(m.missing, ["harness"]);
  assert.equal(m.conversation_id, "c-m");
  assert.deepEqual(v.progress, { understood: 1, total: 3 });
});

test("roll call: a worker sees only understood / not yet for others, never their points", () => {
  const v = rollCallView(crew, { id: "i", role: "worker" });
  assert.equal(v.redacted, true);
  assert.equal(v.rows[0].worker.id, "i");                    // own row first, in full
  assert.deepEqual(v.rows[0].missing, ["helmet", "harness"]);
  const m = v.rows.find((r) => r.worker.id === "m")!;
  assert.equal(m.status, "not_yet");                         // "missed" is not shown to the crew
  assert.equal(m.said, null);
  assert.deepEqual(m.missing, []);
  assert.equal(m.conversation_id, null);
  assert.equal(v.rows.find((r) => r.worker.id === "l")!.status, "understood");
  assert.deepEqual(v.progress, { understood: 1, total: 3 });
});

test("templates select only points the crew still has, at most five", () => {
  const list: { id: string; key: string | null }[] = DEFAULT_SAFETY_POINTS.map((p) => ({ id: `id-${p.key}`, key: p.key }));
  assert.deepEqual(presetPick(PRESETS[0].keys, list), ["id-helmet", "id-harness", "id-shoes", "id-scaffold"]);
  const noHarness = list.filter((p) => p.key !== "harness").concat({ id: "custom", key: null });
  assert.deepEqual(presetPick(PRESETS[0].keys, noHarness), ["id-helmet", "id-shoes", "id-scaffold"]);
  for (const p of PRESETS) assert.ok(p.keys.every((k) => DEFAULT_SAFETY_POINTS.some((d) => d.key === k)), p.id);
  assert.equal(new Set(DEFAULT_SAFETY_POINTS.map((p) => p.key)).size, 8);
});

test("BRIEF card and brief ping parse", () => {
  assert.deepEqual(parseCard(`${CARD.BRIEF}00000000-0000-4000-8000-000000000001`), { kind: "BRIEF", id: "00000000-0000-4000-8000-000000000001" });
  assert.deepEqual(parseCard(`${CARD.STATE}00000000-0000-4000-8000-000000000001:brief`), { kind: "STATE", id: "00000000-0000-4000-8000-000000000001", event: "brief" });
  assert.equal(parseCard(`${CARD.BOARD}00000000-0000-4000-8000-000000000001`)?.kind, "BOARD");
});

test("extract: the whole list goes as S-codes; the picked points are never sent", async () => {
  const f = fake('{"said":["S1","s7"],"gloss_en":"Wear the helmet and check the scaffold tag."}');
  const ex = await extractSafetyPoints("helmet pehen ke rakhna, aur chadhne se pehle tag dekhna", "hi", points, f.run);
  assert.deepEqual(ex, { said: ["helmet", "scaffold"], gloss_en: "Wear the helmet and check the scaffold tag." });
  assert.match(f.calls[0].system, /S1 = Wear your helmet \/ हेलमेट पहनें \/ ஹெல்மெட் அணியுங்கள்/);
  assert.match(f.calls[0].system, /S8 = Report any exposed wire at once/);
  assert.equal(f.calls[0].prompt, "Worker's language: Hindi or Hinglish\nWhat the worker said:\nhelmet pehen ke rakhna, aur chadhne se pehle tag dekhna");
});

test("extract: an unknown code or bad shape is retried once, then null; AI down => null", async () => {
  const retry = fake('{"said":["S9"],"gloss_en":"x"}', '{"said":["S2"],"gloss_en":"Harness above 2 m."}');
  assert.deepEqual((await extractSafetyPoints("x", "en", points, retry.run))?.said, ["harness"]);
  assert.equal(retry.calls.length, 2);
  const bad = fake('{"said":"S1","gloss_en":"x"}');
  assert.equal(await extractSafetyPoints("x", "en", points, bad.run), null);
  assert.equal(bad.calls.length, 2);
  const down = fake(new Error("quota exceeded"));
  assert.equal(await extractSafetyPoints("x", "ta", points, down.run), null);
  assert.equal(down.calls.length, 2);
  assert.deepEqual(parseSafety('```json\n{"said":[],"gloss_en":"Said nothing about safety."}\n```', new Map()), { said: [], gloss_en: "Said nothing about safety." });
  assert.deepEqual(parseSafety('{"said":["S1","S1"],"gloss_en":"x"}', new Map([["S1", "helmet"]])).said, ["helmet"]);
});
