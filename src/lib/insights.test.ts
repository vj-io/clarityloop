// Dashboard number definitions. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInsights } from "./server/insights.ts";

const NOW = Date.parse("2026-11-18T10:00:00Z");
const iso = (m: number) => new Date(NOW - m * 60000).toISOString();
const marks = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, mark]) => [k, { mark, supervisor: null, worker: null }]));
const crew = { name: "c", site_name: "s", is_sandbox: false };
const workers = [{ id: "w1", display_name: "Murugan", language: "ta" as const }, { id: "w2", display_name: "Anil", language: "hi" as const }];

test("empty crew: zeros and nulls, no invented numbers", () => {
  const r = computeInsights([], [], [], workers, crew, NOW);
  assert.equal(r.totals.sent, 0);
  assert.equal(r.totals.restated_pct, null);
  assert.equal(r.totals.median_minutes_to_understood, null);
  assert.equal(r.trend.length, 14);
  assert.equal(r.workers.length, 0);
});

test("definitions", () => {
  const tasks = [
    { id: "a", worker_id: "w1", object_text: "x", state: "understood" as const, created_at: iso(60), understood_at: iso(40) },   // first check red, fixed: caught, 20 min
    { id: "b", worker_id: "w1", object_text: "y", state: "done" as const, created_at: iso(50), understood_at: iso(45) },          // first try, 5 min
    { id: "c", worker_id: "w2", object_text: "z", state: "mismatch" as const, created_at: iso(30), understood_at: null },       // still open
    { id: "d", worker_id: "w2", object_text: "q", state: "waiting" as const, created_at: iso(10), understood_at: null },
  ];
  const rest = [{ task_id: "a" }, { task_id: "a" }, { task_id: "b" }, { task_id: "c" }];
  const checks = [
    { task_id: "a", overall: "all_match" as const, field_marks: marks({ place: "match" }), created_at: iso(39) },   // later check must not count as first
    { task_id: "a", overall: "mismatch" as const, field_marks: marks({ place: "mismatch", time: "unclear", action: "match" }), created_at: iso(55) },
    { task_id: "b", overall: "all_match" as const, field_marks: marks({ place: "match" }), created_at: iso(48) },
    { task_id: "c", overall: "needs_look" as const, field_marks: marks({ place: "unclear" }), created_at: iso(29) },
  ];
  const r = computeInsights(tasks, rest, checks, workers, crew, NOW);
  assert.deepEqual([r.totals.sent, r.totals.restated, r.totals.restated_pct], [4, 3, 75]);
  assert.deepEqual([r.totals.understood, r.totals.understood_pct, r.totals.checked, r.totals.caught], [2, 50, 3, 1]);
  assert.equal(r.totals.median_minutes_to_understood, 12.5);
  const place = r.fields.find((f) => f.field === "place")!;
  assert.deepEqual([place.checked, place.mismatch, place.unclear], [3, 1, 1]);
  assert.deepEqual(r.languages.map((l) => [l.language, l.tasks, l.retried]), [["hi", 2, 0], ["ta", 2, 1]]);
  assert.deepEqual(r.workers.map((w) => [w.name, w.tasks, w.retried]), [["Anil", 2, 0], ["Murugan", 2, 1]]);   // A-Z, not ranked
  assert.equal(r.trend[13].sent, 4);
  assert.equal(r.trend[13].first_try, 1);
  assert.equal(r.recent[0].id, "d");
});

test("languages: a task counts under the language its say-back was written in, not the worker's current one", () => {
  const tasks = [
    { id: "a", worker_id: "w2", object_text: "x", state: "understood" as const, created_at: iso(60), understood_at: iso(40) },   // said back in Marathi, worker now reads Hindi
    { id: "b", worker_id: "w2", object_text: "y", state: "waiting" as const, created_at: iso(10), understood_at: null },          // no say-back: worker's language
  ];
  const r = computeInsights(tasks, [{ task_id: "a", language: "mr" as const }], [], workers, crew, NOW);
  assert.deepEqual(r.languages.map((l) => [l.language, l.tasks]), [["hi", 1], ["mr", 1]]);
  assert.equal(r.workers[0].language, null);   // tasks span two languages: no single label
  const one = computeInsights(tasks.slice(0, 1), [{ task_id: "a", language: "mr" as const }], [], workers, crew, NOW);
  assert.equal(one.workers[0].language, "mr");   // the say-back language, not the worker's current one
});

test("a first check that passed only because the supervisor accepted a field is not a first-try match", async () => {
  const { matchedFirst } = await import("./server/insights.ts");
  const m = (mark: string, accepted = false) => ({ mark, accepted });
  const all = { action: m("match"), object: m("match"), place: m("match"), time: m("match"), quantity: m("match") };
  assert.equal(matchedFirst({ overall: "all_match", field_marks: all }), true);
  assert.equal(matchedFirst({ overall: "all_match", field_marks: { ...all, quantity: m("unclear", true) } }), false);
  assert.equal(matchedFirst({ overall: "mismatch", field_marks: all }), false);
  assert.equal(matchedFirst(undefined), false);
});
