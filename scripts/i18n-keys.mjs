// Interface text keys. Run with plain node:
//   node scripts/i18n-keys.mjs        every key with its English text, as JSON
//   node scripts/i18n-keys.mjs te     keys still missing from src/i18n/beta/te.ts, with their English text
import { DICT } from "../src/lib/i18n.ts";
import { BETA_LANGS } from "../src/lib/types.ts";

const code = process.argv[2];
const en = Object.fromEntries(Object.entries(DICT).map(([k, v]) => [k, v.en]));
if (!code) console.log(JSON.stringify(en, null, 2));
else if (!BETA_LANGS.includes(code)) { console.error(`usage: node scripts/i18n-keys.mjs [${BETA_LANGS.join("|")}]`); process.exit(1); }
else {
  const have = (await import(`../src/i18n/beta/${code}.ts`))[code];
  const missing = Object.fromEntries(Object.entries(en).filter(([k]) => !have[k]?.trim()));
  const extra = Object.keys(have).filter((k) => !(k in en));
  // a placeholder like {name} that the English text has and the translation lost would show up raw or go missing
  const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  const badVars = Object.keys(have).filter((k) => k in en && have[k]?.trim() && vars(have[k]) !== vars(en[k]));
  console.log(JSON.stringify(missing, null, 2));
  console.error(`${code}: ${Object.keys(en).length - Object.keys(missing).length}/${Object.keys(en).length} keys, ${Object.keys(missing).length} missing` +
    (extra.length ? `; unknown keys: ${extra.join(", ")}` : "") + (badVars.length ? `; placeholders differ from English: ${badVars.join(", ")}` : ""));
}
