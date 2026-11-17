// Builds submission/ClarityLoop-writeup.pdf from real test-set results (evals/results.json).
// Run: CHROME=<chromium path> node submission/build-writeup.mjs   (needs playwright resolvable via NODE_PATH or local install)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const here = new URL(".", import.meta.url);
const ev = JSON.parse(readFileSync(new URL("../evals/results.json", here), "utf8"));
const m = ev.models[0], tr = m.translation, mc = m.meaning;
const ran = new Date(ev.ran_at).toISOString().slice(0, 10);
const sec = (ms) => (ms / 1000).toFixed(2) + " s";

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ClarityLoop — write-up</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Patrick+Hand&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Archivo, system-ui, sans-serif; color: #0a0a0a; font-size: 10.6pt; line-height: 1.42; margin: 0; }
  h1 { font-size: 30pt; font-weight: 800; margin: 0 0 2mm; line-height: 1.05; }
  h2 { font-size: 14pt; font-weight: 800; margin: 6mm 0 2mm; }
  h2 span { background: linear-gradient(transparent 55%, #c8ff00 55%, #c8ff00 92%, transparent 92%); padding: 0 1mm; }
  p { margin: 0 0 2.4mm; }
  .hand { font-family: "Patrick Hand", cursive; font-size: 13pt; }
  .mono { font-family: "JetBrains Mono", monospace; }
  .muted { color: #5f5c56; }
  .box { border: 0.7mm solid #0a0a0a; border-radius: 6mm 2mm 6mm 2mm / 2mm 6mm 2mm 6mm; padding: 3.5mm 4mm; margin: 3mm 0; box-shadow: 1.2mm 1.2mm 0 #0a0a0a; background: #fbfaf7; break-inside: avoid; }
  .pen { color: #5b3df5; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 9.8pt; break-inside: avoid; }
  th, td { border-bottom: 0.3mm solid #0a0a0a; padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
  th { font-family: "Patrick Hand", cursive; font-size: 11.5pt; font-weight: 400; }
  .bad { background: #ffdcd6; font-weight: 700; } .ok { color: #157f3b; font-weight: 700; } .red { color: #c2261c; font-weight: 800; }
  ul { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 1mm; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .key { font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 13pt; background: #c8ff00; padding: 0.5mm 2mm; border: 0.5mm solid #0a0a0a; }
  a { color: #5b3df5; }
  .foot { margin-top: 5mm; border-top: 0.4mm dashed #0a0a0a; padding-top: 2mm; font-size: 9pt; }
</style></head><body>

<p class="hand muted">Nexconn Build Challenge 2026 · Track: Workplace &amp; Collaboration · Team Kaching (Vaibhav Jangid)</p>
<h1>ClarityLoop</h1>
<p class="hand" style="font-size:18pt">Read is <span style="background:#c8ff00;padding:0 1.5mm">not</span> understood.</p>

<div class="box">
  <p><b>Live app:</b> <a href="https://clarityloop-theta.vercel.app">clarityloop-theta.vercel.app</a> — judge mode at <span class="mono">/judge</span>, no sign-up.<br>
  <b>Code:</b> <a href="https://github.com/vj-io/clarityloop">github.com/vj-io/clarityloop</a><br>
  <b>Nexconn App Key:</b> <span class="key">qd46yzrfq1obf</span> &nbsp;(Singapore data center; the live demo uses this key)</p>
</div>

<h2><span>Why we built it</span></h2>
<p>On sites where supervisors and workers speak different languages, everyday talk is slow and instructions get misunderstood. A review of 60 studies found language barriers to be the most dominant safety risk factor for migrant construction workers (Guan et al., ECAM, 2022). A study of construction workers in Chennai traced most injuries in its sample to basic language barriers and recommended instructions in workers' own language (Meeral et al., Cureus, 2023). In healthcare, teach-back — the listener repeats an instruction in their own words — is a recommended way to confirm understanding (Yen &amp; Leasure, 2019). We cite these as context, not as proof that the app works.</p>
<p>Existing work-chat apps translate messages and show read receipts. A read receipt shows that a message was opened, not that it was understood. Nothing checks, instruction by instruction, that the worker's understanding matches what the supervisor meant.</p>

<h2><span>What ClarityLoop does</span></h2>
<div class="cols">
  <div class="box"><p class="hand pen">Layer 1 · Chat in your own language</p>
  <p>Each person reads and writes in English, Hindi (including Hinglish typed in Roman letters) or Tamil. Every received message is shown in the reader's language; "See original" shows the exact words sent. Place names, numbers and times are protected.</p></div>
  <div class="box"><p class="hand pen">Layer 2 · Meaning check</p>
  <p>The supervisor sends a task: action, object, place, time, quantity. There is no OK button. The worker says it back in their own words. A card compares each field side by side and blocks Confirm while anything differs or is unclear.</p></div>
</div>

<div class="box"><p class="hand pen">At crew scale</p>
<p>One task can go to the <b>whole crew</b>: every worker gets it in their own language and says it back separately. A live <b>roll-call board</b> in the crew chat shows who understood and who has not; only the supervisor sees which field a worker got wrong, so nobody is shamed in front of the crew. Workers can <b>speak instead of type</b> and <b>listen instead of read</b>. The supervisor gets an <b>insights</b> page (caught before work started, most-missed fields, by language) and a printable <b>record</b> of every task.</p></div>

<p class="hand">The demo case, as it runs on the live app:</p>
<p>Supervisor sends <b>Unload · cement bags · Gate 3 · 14:00 · 40 bags</b>. Worker replies in Hinglish: <i>"40 bori cement Gate 2 pe utaarna hai, 2 baje tak."</i></p>
<table>
  <tr><th>Field</th><th>Supervisor</th><th>Worker</th><th>Mark</th></tr>
  <tr><td>Action</td><td>Unload</td><td>Unload</td><td class="ok">✓ Match</td></tr>
  <tr><td>Object</td><td>cement bags</td><td>cement bags</td><td class="ok">✓ Match</td></tr>
  <tr class="bad"><td>Place</td><td>Gate 3</td><td>Gate 2</td><td class="red">✗ Mismatch</td></tr>
  <tr><td>Time</td><td class="mono">14:00</td><td class="mono">14:00 (from "2 baje")</td><td class="ok">✓ Match</td></tr>
  <tr><td>Quantity</td><td>40 bags</td><td>40 bags</td><td class="ok">✓ Match</td></tr>
</table>
<p>The translation was fine and the meaning still slipped. They sort it out in the same chat, the worker restates, the card turns green, both confirm, and an Understood card records it.</p>

<h2><span>How it uses the Nexconn SDK</span></h2>
<table>
  <tr><th>Feature</th><th>Where the app uses it</th></tr>
  <tr><td>Chat SDK for Web<br><span class="mono">@nexconn/chat 26.2.1</span></td><td><span class="mono">NCEngine.initialize</span> + <span class="mono">connect</span> with a server-issued token. Every conversation screen runs on it.</td></tr>
  <tr><td>Connection status handler</td><td>The "live / connecting / offline" chip; on a drop the app fetches a fresh token, reconnects and re-reads history, so nothing is missed or doubled.</td></tr>
  <tr><td>Group channels</td><td>One group channel per supervisor–worker pair carries both everyday chat and task cards.</td></tr>
  <tr><td>Send text message</td><td>The composer: <span class="mono">GroupChannel.sendMessage(SendTextMessageParams)</span>.</td></tr>
  <tr><td>Receive messages</td><td>A message handler puts chat bubbles and cards into the other person's window live.</td></tr>
  <tr><td>Message history</td><td><span class="mono">createMessagesQuery</span> loads the conversation on open and after a reconnect.</td></tr>
  <tr><td>Server API: access tokens</td><td><span class="mono">/v4/auth/access-token/issue</span>, signed on our server; each browser only ever gets a token for its own user.</td></tr>
  <tr><td>Server API: groups + messages</td><td>The server creates and joins the pair's group and posts every card (task, comparison, Understood, Done) as a bot user. Cards are plain Nexconn text with a prefix, so state changes reach both people through the same live channel. A card typed by a user is ignored.</td></tr>
  <tr><td>Read receipts</td><td><span class="mono">needReceipt</span>, <span class="mono">sendReadReceiptResponse</span>, <span class="mono">onMessageReceiptResponse</span>: "Read 14:02" under a bubble, "Read by 2 of 3" in crew chat. Next to it the task card says "Seen · not yet understood": read is not understood.</td></tr>
  <tr><td>Unread counts, channel list, mentions</td><td><span class="mono">createChannelsQuery</span>, <span class="mono">clearUnreadCount</span> for inbox pills; <span class="mono">mentionedInfo</span> for @mentions in crew chat.</td></tr>
  <tr><td>Crew channel</td><td>One group channel per crew carries crew chat, the roll-call board card and its live update pings.</td></tr>
  <tr><td>Message id</td><td>Nexconn's message id is the cache key for each translation, so a message is translated once per language.</td></tr>
</table>

<h2><span>How it is built</span></h2>
<ul>
  <li><b>Next.js (App Router) on Vercel</b> — interface and server routes. <b>Supabase</b> — auth and Postgres with row-level security on every table. <b>Nexconn</b> — live conversations. <b>AI model</b> (<span class="mono">${m.model}</span>) — three narrow jobs: translate chat, translate task text, read the worker's reply into fixed fields.</li>
  <li><b>The AI never decides.</b> It only reads the worker's words into a schema checked by code, and it never sees the supervisor's values. Plain code compares the fields (work-hours rule: a bare hour 1–6 is read as afternoon and shown, so either person can correct it). An unreadable reply turns the card amber instead of guessing. Only the two people can confirm.</li>
  <li><b>Record keeping.</b> Tasks, restatements, checks, acceptances and every state change are stored in our database with who and when; Nexconn is never the only copy.</li>
  <li><b>Security and privacy.</b> App Secret, database service key and AI key are server-side only. Workers join with a crew code and a hashed 4-digit PIN with lockout. Translation is limited to members of a conversation and rate-limited. No location, no photos of people, no attendance; workers see everything the supervisor sees.</li>
</ul>

<h2><span>What we measured</span></h2>
<p>Fixed test sets in the repository (<span class="mono">evals/</span>), run on ${ran} against the real model through the same code the app uses:</p>
<table>
  <tr><th>Check</th><th>Result</th><th>Our target</th></tr>
  <tr><td>Planted mismatches caught (wrong gate, morning vs afternoon, wrong quantity, wrong action, missing field, Hinglish reply)</td><td><b>${mc.caught} of ${mc.planted}</b></td><td>all</td></tr>
  <tr><td>False alarms on correct restatements</td><td><b>${mc.false_alarms} of ${mc.cases - mc.planted}</b></td><td>at most 1</td></tr>
  <tr><td>Translation runs completed, with every number and place name kept</td><td><b>${tr.runs - tr.failed - tr.must_keep_violations} of ${tr.runs}</b>${tr.failed ? ` (${tr.failed} did not complete)` : ""}${tr.must_keep_violations ? ` (${tr.must_keep_violations} flagged by our strict label check: correct Tamil that inflects the place name)` : ""}</td><td>all numbers and places kept</td></tr>
  <tr><td>Median translation time / field-reading time</td><td><b>${sec(tr.median_ms)}</b> / <b>${sec(mc.median_ms)}</b> (measured from India)</td><td>under 1.5 s / under 5 s — translation speed is not met yet on a free-tier model key; the app shows the original at once and swaps the translation in</td></tr>
</table>
<p class="muted">What these numbers are not: a native speaker has not yet rated translation quality, the test sets are small and written by us, and no pilot with real workers has run yet. We report only what was measured.</p>

<h2><span>Where it goes next</span></h2>
<div class="cols">
  <div><p><b>Roadmap.</b> Pilot-ready: voice messages and read-aloud, crew chat, a site glossary learned from "Translation looks wrong" flags. Site product: daily safety-briefing checks, shift handover checks, a site dashboard and audit export. Scale: multi-site admin, SMS and WhatsApp reach, data controls.</p></div>
  <div><p><b>Business (a plan to test).</b> The employer pays, workers use it free: per active worker per month, with a free tier for one small crew. First buyers: mid-size contractors, facility-management firms, warehouses. What compounds: crew glossaries, misunderstanding data, and a trusted record of what was agreed.</p></div>
</div>

<p class="foot">ClarityLoop is an extra check, not a safety guarantee. Built for the Nexconn Build Challenge 2026 by Team Kaching — Vaibhav Jangid. App Key <span class="mono">qd46yzrfq1obf</span>.</p>
</body></html>`;

writeFileSync(new URL("ClarityLoop-writeup.html", here), html);
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage();
await page.goto(new URL("ClarityLoop-writeup.html", here).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: new URL("ClarityLoop-writeup.pdf", here).pathname, format: "A4", printBackground: true });
console.log("pages:", await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight / 1123)));
await browser.close();
