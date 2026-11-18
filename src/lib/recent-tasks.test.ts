// "Send again" chips. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { recentDistinct } from "./recent-tasks.ts";

const r = (object_text: string, o: Partial<{ action_id: string; place_id: string; quantity: number | null; unit: string | null; sample: boolean }> = {}) =>
  ({ action_id: "a1", place_id: "p1", quantity: 40, unit: "bags", sample: false, object_text, ...o });

test("send again: distinct, newest first, at most five", () => {
  const rows = [r("cement bags"), r("Cement Bags "), r("cement bags", { place_id: "p2" }), r("tiles"), r("sand"), r("rods"), r("bricks"), r("paint")];
  assert.deepEqual(recentDistinct(rows).map((x) => `${x.object_text}@${x.place_id}`), ["cement bags@p1", "cement bags@p2", "tiles@p1", "sand@p1", "rods@p1"]);
});

test("send again: samples only when the supervisor has sent nothing", () => {
  const sample = r("sand bags", { sample: true });
  assert.deepEqual(recentDistinct([r("tiles"), sample]).map((x) => x.object_text), ["tiles"]);
  assert.deepEqual(recentDistinct([sample, sample]), [sample]);
  assert.deepEqual(recentDistinct([]), []);
});
