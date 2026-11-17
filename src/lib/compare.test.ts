// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFields, overallOf, resolveTime, sameObject } from "./compare.ts";
import { parseCard, type Extraction, type TaskFields } from "./types.ts";

const task: TaskFields = { action_id: "unload", object_en: "cement bags", place_id: "gate3", due_time: "14:00", quantity: 40, unit: "bags" };
const ex = (o: Partial<Extraction> = {}): Extraction => ({
  action: "unload", object: "cement bags", object_maybe_same: false, place: "gate3",
  time: "02:00", time_ambiguous: true, quantity: 40, unit: "bags", gloss_en: "x", ...o,
});

test("PRD demo case: only place mismatches, '2 baje' reads as 14:00", () => {
  const m = compareFields(task, ex({ place: "gate2" }));
  assert.deepEqual([m.action.mark, m.object.mark, m.place.mark, m.time.mark, m.quantity.mark],
    ["match", "match", "mismatch", "match", "match"]);
  assert.equal(m.time.worker, "14:00");
  assert.equal(m.time.reason, "afternoon_assumed");
  assert.equal(overallOf(m), "mismatch");
});

test("correct restatement is all_match", () => assert.equal(overallOf(compareFields(task, ex())), "all_match"));

test("planted mismatches are each caught", () => {
  assert.equal(compareFields(task, ex({ time: "09:00", time_ambiguous: false })).time.mark, "mismatch"); // morning vs afternoon
  assert.equal(compareFields(task, ex({ quantity: 14 })).quantity.mark, "mismatch");
  assert.equal(compareFields(task, ex({ action: "move" })).action.mark, "mismatch");
  assert.equal(compareFields(task, ex({ object: "sand" })).object.mark, "mismatch");
});

test("missing or unknown fields are unclear, never match", () => {
  const m = compareFields(task, ex({ place: "unknown", time: null, quantity: null, object: null, action: "unknown" }));
  for (const f of ["action", "object", "place", "time", "quantity"] as const) assert.equal(m[f].mark, "unclear");
  assert.equal(overallOf(m), "needs_look");
});

test("bare hour 7-11 cannot be settled", () => {
  assert.deepEqual(resolveTime("09:00", true).readings, ["09:00", "21:00"]);
  const t9: TaskFields = { ...task, due_time: "09:00" };
  assert.equal(compareFields(t9, ex({ time: "09:00", time_ambiguous: true })).time.mark, "unclear");
  assert.equal(compareFields(task, ex({ time: "09:00", time_ambiguous: true })).time.mark, "mismatch");
  assert.equal(resolveTime("12:00", true).settled, "12:00");
  assert.equal(resolveTime("14:00", true).settled, "14:00"); // extractor already added 12
});

test("object: plurals and container words do not cause false alarms", () => {
  assert.ok(sameObject("cement bags", "Cement bag"));
  assert.ok(sameObject("cement bags", "cement"));
  assert.ok(sameObject("cement bags", "cement sacks"));
  assert.ok(sameObject("the boxes", "box"));
  assert.ok(!sameObject("cement bags", "sand bags"));
  assert.equal(compareFields(task, ex({ object: "material", object_maybe_same: true })).object.mark, "unclear");
});

test("accepting unclear fields opens confirm; a mismatch can never be accepted away", () => {
  const m = compareFields(task, ex({ time: null }));
  assert.equal(overallOf(m), "needs_look");
  m.time.accepted = true;
  assert.equal(overallOf(m), "all_match");
  const bad = compareFields(task, ex({ place: "gate2" }));
  bad.place.accepted = true;
  assert.equal(overallOf(bad), "mismatch");
});

test("unreadable AI answer: amber, nothing matches", () => {
  const m = compareFields(task, null);
  assert.equal(overallOf(m), "needs_look");
  assert.equal(m.place.reason, "unreadable");
});

test("task without quantity", () => {
  const t: TaskFields = { ...task, quantity: null, unit: null };
  assert.equal(compareFields(t, ex({ quantity: null, unit: null })).quantity.mark, "match");
  assert.equal(compareFields(t, ex()).quantity.mark, "unclear");
});

test("card prefixes", () => {
  assert.deepEqual(parseCard("[[CL:TASK]]abc"), { kind: "TASK", id: "abc" });
  assert.equal(parseCard("hello [[CL:TASK]]abc"), null);
  assert.deepEqual(parseCard("[[CL:STATE]]t1:understood"), { kind: "STATE", id: "t1", event: "understood" });
});
