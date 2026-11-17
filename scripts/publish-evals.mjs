// Copies the headline numbers of evals/results.json to public/evals-results.json for the /results page.
import { readFileSync, writeFileSync } from "node:fs";
const ev = JSON.parse(readFileSync(new URL("../evals/results.json", import.meta.url), "utf8"));
const out = {
  ran_at: ev.ran_at,
  models: ev.models.map((m) => ({
    model: m.model,
    translation: {
      total: m.translation.runs,
      kept_ok: m.translation.runs - m.translation.failed - m.translation.must_keep_violations,
      median_ms: m.translation.median_ms, p90_ms: m.translation.p90_ms,
    },
    meaning: {
      total: m.meaning.cases, planted: m.meaning.planted, caught: m.meaning.caught,
      false_alarms: m.meaning.false_alarms, median_ms: m.meaning.median_ms,
    },
  })),
};
writeFileSync(new URL("../public/evals-results.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out.models[0]));
