// Roll-call board: redaction for workers, progress counts, card parsing. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardView, type BoardItem } from "./server/board.ts";
import { CARD, parseCard, type TaskState } from "./types.ts";

const item = (id: string, name: string, state: TaskState, issues: BoardItem["issues"] = []): BoardItem => ({
  worker: { id, name, language: "hi" }, task_id: `t-${id}`, conversation_id: `c-${id}`, state, issues,
});
const gate = [{ field: "place" as const, mark: "mismatch" as const, supervisor: "Gate 3", worker: "Gate 2" }];
const crew = [item("m", "Murugan", "mismatch", gate), item("l", "Lakshmi", "understood"), item("i", "Imran", "done")];

test("supervisor sees every row in full, sorted by name, with progress", () => {
  const v = boardView(crew, { id: "sup", role: "supervisor" });
  assert.equal(v.redacted, false);
  assert.deepEqual(v.rows.map((r) => r.worker.name), ["Imran", "Lakshmi", "Murugan"]);
  const m = v.rows.find((r) => r.worker.id === "m")!;
  assert.equal(m.status, "mismatch");
  assert.deepEqual(m.issues, gate);
  assert.equal(m.conversation_id, "c-m");
  assert.deepEqual(v.progress, { understood: 2, total: 3 }); // understood + done
});

test("a worker sees their own row in full and only understood / not yet for others", () => {
  const v = boardView(crew, { id: "l", role: "worker" });
  assert.equal(v.redacted, true);
  assert.equal(v.rows[0].worker.id, "l");               // own row first
  assert.equal(v.rows[0].is_me, true);
  assert.equal(v.rows[0].conversation_id, "c-l");
  const m = v.rows.find((r) => r.worker.id === "m")!;
  assert.equal(m.status, "not_yet");                     // a mismatch is never shown to the crew
  assert.deepEqual(m.issues, []);
  assert.equal(m.task_id, null);
  assert.equal(m.conversation_id, null);
  assert.equal(v.rows.find((r) => r.worker.id === "i")!.status, "understood"); // done reads as understood
  assert.deepEqual(v.progress, { understood: 2, total: 3 });
});

test("the mismatched worker still sees their own mismatch fields", () => {
  const v = boardView(crew, { id: "m", role: "worker" });
  assert.equal(v.rows[0].status, "mismatch");
  assert.deepEqual(v.rows[0].issues, gate);
  assert.ok(v.rows.slice(1).every((r) => r.status === "understood" || r.status === "not_yet"));
});

test("every unfinished state counts as not yet; empty crew is 0 of 0", () => {
  const states: TaskState[] = ["waiting", "checking", "mismatch", "needs_look", "all_match"];
  const v = boardView(states.map((s, i) => item(String(i), `W${i}`, s)), { id: "x", role: "worker" });
  assert.ok(v.rows.every((r) => r.status === "not_yet"));
  assert.deepEqual(v.progress, { understood: 0, total: 5 });
  assert.deepEqual(boardView([], { id: "s", role: "supervisor" }).progress, { understood: 0, total: 0 });
});

test("parseCard: BOARD card and the board ping", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  assert.deepEqual(parseCard(CARD.BOARD + id), { kind: "BOARD", id });
  assert.deepEqual(parseCard(`${CARD.STATE}${id}:board`), { kind: "STATE", id, event: "board" });
  assert.deepEqual(parseCard(`${CARD.TASK}${id}`), { kind: "TASK", id });   // existing cards unchanged
  assert.equal(parseCard("[[CL:BOARDX]]"), null);
  assert.equal(parseCard("hello [[CL:BOARD]]x"), null);
});
