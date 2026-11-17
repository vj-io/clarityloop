// PRD go/no-go gate: runs evals/translation.json and evals/meaning.json through the REAL
// translateText / extractFields (AI Gateway) + compareFields, per model.
// Run: node --env-file=.env.local scripts/eval.mjs [model ...]     (default: $AI_MODEL or the app default)
// Exits non-zero, writing nothing, when the gateway refuses. Never writes made-up numbers.
import { readFileSync, writeFileSync } from "node:fs";
import { AI_MODEL, asciiDigits, extractFields, gatewayRunner, translateText } from "../src/lib/server/ai.ts";
import { compareFields, overallOf } from "../src/lib/compare.ts";
import { DEFAULT_ACTIONS, DEFAULT_PLACES } from "../src/lib/server/seed.ts";

const read = (f) => JSON.parse(readFileSync(new URL(`../evals/${f}`, import.meta.url), "utf8"));
const TR = read("translation.json"), MEAN = read("meaning.json");
const lists = {
  places: DEFAULT_PLACES.map((p) => ({ id: p.key, labels: p.labels })),
  actions: DEFAULT_ACTIONS.map((a) => ({ id: a.key, labels: a.labels })),
};
const FIELDS = ["action", "object", "place", "time", "quantity"];
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };

function violations(mustKeep, out, target) {
  const runs = new Set(asciiDigits(out).match(/\d+/g) ?? []);
  return mustKeep.filter((k) => {
    if (k.startsWith("place:")) {
      const p = lists.places.find((x) => x.id === k.slice(6));
      return !(out.includes(p.labels[target]) || out.toLowerCase().includes(p.labels.en.toLowerCase()));
    }
    return !runs.has(k);
  });
}

// Free-tier keys allow only a few requests per minute: EVAL_GAP_MS spaces the cases out.
// The wait sits outside the timed part, so latency numbers are unaffected.
const GAP = Number(process.env.EVAL_GAP_MS ?? 0);
const pace = () => (GAP ? new Promise((r) => setTimeout(r, GAP)) : null);

async function runModel(model) {
  const errors = [];
  const base = gatewayRunner(model);
  const runner = async (req) => {
    try { return await base(req); } catch (e) { errors.push(String(e?.message ?? e).slice(0, 200)); throw e; }
  };
  // Pre-flight: a refused gateway (no card, bad model id, no auth) stops everything.
  try { await base({ system: "", prompt: "Reply with the single word: ok", maxTokens: 16 }); }
  catch (e) { throw new Error(`gateway refused model ${model}: ${e?.message ?? e}`); }

  const tr = [];
  for (const m of TR.messages) for (const to of TR.directions[m.lang]) {
    await pace();
    const t0 = Date.now();
    let out = null, error = null;
    try { out = (await translateText(m.text, to, lists, runner))?.text ?? null; if (out == null) error = "not translated (detected same language)"; }
    catch (e) { error = String(e?.message ?? e); }
    const ms = Date.now() - t0;
    tr.push({ id: m.id, from: m.lang, to, text: m.text, out, ms, error, violations: out ? violations(m.must_keep, out, to) : m.must_keep });
    process.stdout.write(error ? "x" : ".");
  }
  process.stdout.write("\n");

  const mc = [];
  for (const c of MEAN.cases) {
    await pace();
    const t0 = Date.now();
    const ex = await extractFields(c.restatement, c.language, lists.actions, lists.places, runner);
    const ms = Date.now() - t0;
    const marks = compareFields({ action_id: c.task.action, object_en: c.task.object, place_id: c.task.place, due_time: c.task.due_time, quantity: c.task.quantity, unit: c.task.unit }, ex);
    const overall = overallOf(marks);
    const got = Object.fromEntries(FIELDS.map((f) => [f, marks[f].mark]));
    const wrongFields = FIELDS.filter((f) => got[f] !== c.expected[f]);
    mc.push({
      id: c.id, planted: c.planted, overall, ms, unreadable: ex == null, extracted: ex, marks: got, wrong_fields: wrongFields,
      caught: c.planted ? overall !== "all_match" && got[c.planted] === c.expected[c.planted] : null,
      false_alarm: c.planted ? null : overall !== "all_match",
    });
    process.stdout.write(c.planted ? (mc.at(-1).caught ? "+" : "!") : (mc.at(-1).false_alarm ? "!" : "."));
  }
  process.stdout.write("\n");

  const okTr = tr.filter((t) => !t.error);
  return {
    model,
    runner_errors: errors.length, runner_error_samples: errors.slice(0, 3),
    translation: {
      runs: tr.length, failed: tr.length - okTr.length,
      must_keep_violations: tr.filter((t) => t.violations.length).length,
      median_ms: pct(okTr.map((t) => t.ms), 0.5), p90_ms: pct(okTr.map((t) => t.ms), 0.9),
      results: tr,
    },
    meaning: {
      cases: mc.length, planted: mc.filter((c) => c.planted).length,
      caught: mc.filter((c) => c.caught).length, false_alarms: mc.filter((c) => c.false_alarm).length,
      unreadable: mc.filter((c) => c.unreadable).length,
      field_errors: mc.reduce((n, c) => n + c.wrong_fields.length, 0),
      median_ms: pct(mc.map((c) => c.ms), 0.5), p90_ms: pct(mc.map((c) => c.ms), 0.9),
      results: mc,
    },
  };
}

const models = process.argv.slice(2).length ? process.argv.slice(2) : [AI_MODEL];
const done = [];
let bad = false;
for (const model of models) {
  console.log(`\n== ${model}`);
  let r;
  try { r = await runModel(model); }
  catch (e) { console.error(`FATAL: ${e.message}`); bad = true; continue; }
  const t = r.translation, m = r.meaning;
  console.log(`translation: ${t.runs - t.failed}/${t.runs} translated, failed ${t.failed}, must_keep violations ${t.must_keep_violations}, median ${t.median_ms} ms, p90 ${t.p90_ms} ms`);
  console.log(`meaning:     planted caught ${m.caught}/${m.planted}, false alarms ${m.false_alarms}/${m.cases - m.planted}, unreadable ${m.unreadable}, field errors ${m.field_errors}, median ${m.median_ms} ms, p90 ${m.p90_ms} ms`);
  const gate = m.caught === m.planted && m.false_alarms <= 1 && (t.median_ms ?? Infinity) < 1500 && t.must_keep_violations === 0;
  console.log(`gate (numbers only; native-speaker rating still needed): ${gate ? "PASS" : "FAIL"}`);
  if (r.runner_errors) { console.error(`WARNING: ${r.runner_errors} model calls threw (e.g. ${r.runner_error_samples[0]}); counted as failures above.`); bad = true; }
  done.push(r);
}
if (done.length) {
  writeFileSync(new URL("../evals/results.json", import.meta.url), JSON.stringify({ ran_at: new Date().toISOString(), models: done }, null, 2));
  console.log("\nwrote evals/results.json");
} else {
  console.error("\nno model ran; evals/results.json not written");
}
process.exit(bad ? 1 : 0);
