// FR-14: our code, not the AI, decides match / mismatch / unclear.
import type { Extraction, FieldKey, FieldMark, FieldMarks, Overall, TaskFields } from "./types.ts";
import { FIELDS } from "./types.ts";

// Container / unit words carry no meaning for "what is the object".
const CONTAINERS = new Set([
  "bag", "sack", "bori", "packet", "box", "carton", "piece", "pc", "unit", "bundle", "load",
  "bucket", "can", "drum", "pallet", "crate", "roll", "sheet", "bottle", "tin",
]);
const STOP = new Set(["the", "a", "an", "of", "some", "all", "those", "these"]);

const singular = (w: string) =>
  w.length > 3 && w.endsWith("ies") ? w.slice(0, -3) + "y"
  : w.length > 3 && /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2)
  : w.length > 2 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1)
  : w;

export function objectTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean)
    .map(singular).filter((w) => !STOP.has(w));
}
const core = (t: string[]) => { const c = t.filter((w) => !CONTAINERS.has(w)); return c.length ? c : t; };

export function sameObject(a: string, b: string): boolean {
  const ta = objectTokens(a), tb = objectTokens(b);
  if (ta.join(" ") === tb.join(" ")) return true;
  const ca = core(ta).sort().join(" "), cb = core(tb).sort().join(" ");
  return ca.length > 0 && ca === cb;
}

/** One name's words are all inside the other ("rods" / "iron rods"): maybe the same thing, so amber, never green or red. */
export function relatedObject(a: string, b: string): boolean {
  const ca = core(objectTokens(a)), cb = core(objectTokens(b));
  if (!ca.length || !cb.length) return false;
  const inside = (x: string[], y: string[]) => x.every((w) => y.includes(w));
  return inside(ca, cb) || inside(cb, ca);
}

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * Work-hours rule. A bare hour 1–6 is read as afternoon. A bare 12 is noon.
 * A bare 7–11 cannot be settled: returns both readings.
 */
export function resolveTime(time: string, ambiguous: boolean): { settled: string | null; readings: string[]; assumed: boolean } {
  const [h0, m] = time.split(":").map(Number);
  if (!ambiguous) return { settled: time, readings: [time], assumed: false };
  const bare = h0 % 12; // tolerate an extractor that already added 12
  if (bare === 0) return { settled: hhmm(12, m), readings: [hhmm(12, m)], assumed: false };
  if (bare >= 1 && bare <= 6) return { settled: hhmm(bare + 12, m), readings: [hhmm(bare + 12, m)], assumed: true };
  return { settled: null, readings: [hhmm(bare, m), hhmm(bare + 12, m)], assumed: false };
}

export const fmtQty = (q: number | null, unit: string | null) =>
  q == null ? null : `${q}${unit ? " " + unit : ""}`;

export function compareFields(task: TaskFields, ex: Extraction | null): FieldMarks {
  const supQty = fmtQty(task.quantity, task.unit);
  if (!ex) {
    const u = (supervisor: string | null): FieldMark => ({ mark: "unclear", supervisor, worker: null, reason: "unreadable" });
    return { action: u(task.action_id), object: u(task.object_en), place: u(task.place_id), time: u(task.due_time), quantity: task.quantity == null ? { mark: "match", supervisor: null, worker: null } : u(supQty) };
  }

  const listField = (sup: string, got: string): FieldMark =>
    got === "unknown" ? { mark: "unclear", supervisor: sup, worker: null, reason: "unknown" }
    : { mark: got === sup ? "match" : "mismatch", supervisor: sup, worker: got };

  const names = [task.object_en, ...(task.object_aliases ?? [])];
  let object: FieldMark;
  if (!ex.object || !ex.object.trim()) object = { mark: "unclear", supervisor: task.object_en, worker: null, reason: "not_mentioned" };
  else if (names.some((name) => sameObject(name, ex.object!))) object = { mark: "match", supervisor: task.object_en, worker: ex.object };
  else if (ex.object_maybe_same || names.some((name) => relatedObject(name, ex.object!))) object = { mark: "unclear", supervisor: task.object_en, worker: ex.object, reason: "vague" };
  else object = { mark: "mismatch", supervisor: task.object_en, worker: ex.object };

  let time: FieldMark;
  if (!ex.time) time = { mark: "unclear", supervisor: task.due_time, worker: null, reason: "not_mentioned" };
  else {
    const r = resolveTime(ex.time, ex.time_ambiguous);
    if (r.settled) time = { mark: r.settled === task.due_time ? "match" : "mismatch", supervisor: task.due_time, worker: r.settled, ...(r.assumed ? { reason: "afternoon_assumed" as const } : {}) };
    else if (r.readings.includes(task.due_time)) time = { mark: "unclear", supervisor: task.due_time, worker: r.readings[0], reason: "hour_ambiguous" };
    else time = { mark: "mismatch", supervisor: task.due_time, worker: r.readings[0], reason: "hour_ambiguous" };
  }

  let quantity: FieldMark;
  const wrkQty = fmtQty(ex.quantity, ex.unit);
  if (task.quantity == null) quantity = ex.quantity == null ? { mark: "match", supervisor: null, worker: null } : { mark: "unclear", supervisor: null, worker: wrkQty, reason: "extra" };
  else if (ex.quantity == null) quantity = { mark: "unclear", supervisor: supQty, worker: null, reason: "not_mentioned" };
  else quantity = { mark: Number(ex.quantity) === Number(task.quantity) ? "match" : "mismatch", supervisor: supQty, worker: wrkQty };

  return { action: listField(task.action_id, ex.action), object, place: listField(task.place_id, ex.place), time, quantity };
}

/** Confirm is open only when every field matches or an unclear field was accepted. */
export function overallOf(marks: FieldMarks): Overall {
  const all = FIELDS.map((f: FieldKey) => marks[f]);
  if (all.some((m) => m.mark === "mismatch")) return "mismatch";
  if (all.some((m) => m.mark === "unclear" && !m.accepted)) return "needs_look";
  return "all_match";
}
