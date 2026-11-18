// CSV export and briefing numbers. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { istStamp, toCsv } from "./insights-csv.ts";
import { computeBriefingInsights, tally, taskOutcome } from "./server/insights.ts";

test("csv: BOM, quoting, formula cells defused", () => {
  const csv = toCsv([["a", "सरिया, \"20\""], ["=SUM(A1)", "+1"], ["-2", "@x"], [40, null], ["Gate-3", "a=b"]]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.deepEqual(csv.slice(1).split("\r\n"), [
    '"a","सरिया, ""20"""', `"'=SUM(A1)","'+1"`, `"'-2","'@x"`, '"40",""', '"Gate-3","a=b"', "",
  ]);
});

test("csv: IST time stamp", () => {
  assert.equal(istStamp("2026-11-18T10:00:00Z"), "2026-11-18 15:30");
  assert.equal(istStamp(null), "");
});

test("export: say-backs and the first check of a task", () => {
  const m = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, mark]) => [k, { mark, supervisor: null, worker: null }]));
  const t = tally([{ task_id: "a" }, { task_id: "a" }], [
    { task_id: "a", overall: "all_match", field_marks: m({ place: "match" }), created_at: "2026-11-18T10:05:00Z" },
    { task_id: "a", overall: "mismatch", field_marks: m({ place: "mismatch", time: "unclear", action: "match" }), created_at: "2026-11-18T10:01:00Z" },
  ]);
  assert.deepEqual(taskOutcome("a", t), { say_backs: 2, first_match: false, wrong_first: ["place", "time"] });
  assert.deepEqual(taskOutcome("never", t), { say_backs: 0, first_match: null, wrong_first: [] });
});

test("briefings: first readable reply decides first try and what was left out", () => {
  const a = (said: string[], unreadable = false) => ({ said, unreadable });
  const r = computeBriefingInsights(
    [{ id: "b1", point_ids: ["helmet", "harness"] }, { id: "b2", point_ids: ["helmet", "shoes", "wire"] }],
    [
      { briefing_id: "b1", attempts: [a(["helmet", "harness", "phone"])] },                 // all first try (an extra point is fine)
      { briefing_id: "b1", attempts: [a([], true), a(["helmet"]), a(["harness"])] },      // unreadable skipped; first readable left out harness
      { briefing_id: "b2", attempts: [a(["shoes"]), a(["helmet", "wire"])] },             // left out helmet + wire, fixed later: still not first try
      { briefing_id: "b2", attempts: [] },                                                 // no reply yet
      { briefing_id: "b2", attempts: null },
      { briefing_id: "other-crew", attempts: [a(["helmet"])] },                            // not one of these briefings
    ],
  );
  assert.deepEqual([r.sent, r.expected, r.replied, r.first_try], [2, 5, 3, 1]);
  assert.deepEqual(r.missed, [{ id: "helmet", missed: 1, of: 3 }, { id: "harness", missed: 1, of: 2 }, { id: "wire", missed: 1, of: 1 }]);   // ties keep briefing order
  assert.deepEqual(computeBriefingInsights([], []), { sent: 0, expected: 0, replied: 0, first_try: 0, missed: [] });
});
