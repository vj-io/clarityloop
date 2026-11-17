import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSampleRows } from "./server/sample-history.ts";

test("sandbox sample history: every sample ends matched, and first checks show real differences", () => {
  const r = buildSampleRows({
    supervisorId: "sup", workers: { murugan: { id: "m", conversationId: "cm" }, lakshmi: { id: "l", conversationId: "cl" } },
    placeId: (i) => `p${i}`, actionId: (i) => `a${i}`,
  }, new Date("2026-11-18T12:00:00Z"));
  assert.equal(r.tasks.length, 10);
  assert.ok(r.tasks.every((t) => t.is_sandbox === true));
  const firstOverall = r.tasks.map((t) => r.checks.find((c) => c.task_id === t.id)!.overall);
  assert.equal(firstOverall.filter((o) => o === "mismatch").length, 4);   // wrong gate x2, wrong quantity, morning vs afternoon
  assert.equal(firstOverall.filter((o) => o === "needs_look").length, 1); // place not mentioned
  assert.equal(firstOverall.filter((o) => o === "all_match").length, 5);
});
