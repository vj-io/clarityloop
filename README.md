# ClarityLoop

**Read is not understood.**

ClarityLoop is a work chat where a supervisor and workers who don't share a language each read and write in their own language. Any instruction sent as a task must be said back by the worker. AI reads the reply into fields, plain code compares them, and a Meaning Mismatch card blocks confirmation until both people agree.

It is an extra check, not a safety guarantee. It was built for the Nexconn Build Challenge 2026 and has not been piloted with real crews yet (see "Tests and evals" and "Not in this build").

**Built on the Nexconn Chat SDK** (live group channels, read receipts, unread counts, @mentions). App Key: `qd46yzrfq1obf`.

## What it does

### Chat in your own language

- Every message is shown in the reader's language, with "See original" one tap away. Languages: English, Hindi (including Hinglish typed in Roman letters) and Tamil. Bengali, Telugu and Marathi are available as beta: their interface text is machine-written and no native speaker has checked it, and the language pickers say so.
- A reader can tap "Translation looks wrong" on a message.
- Messages typed before the connection is live, or while offline, are queued and sent once.
- Nexconn read receipts ("Read 14:02", "Read by 2 of 3"), unread counts in the inbox, and @mentions in crew chat.

### The meaning check

The supervisor sends a message as a task (action, object, place, time, quantity). The worker cannot tap OK: they say it back in their own words. A card compares each field and shows red, amber or green. Confirm stays blocked while anything differs or is unclear. When every field matches, both people tap Confirm and the task shows as Understood; the supervisor can then mark it done.

Worked example. The supervisor sends "Unload · cement bags · Gate 3 · 14:00 · 40 bags":

| Field | Supervisor sent | Worker restated | Result |
| --- | --- | --- | --- |
| Action | Unload | Unload | Match |
| Object | cement bags | cement bags | Match |
| Place | Gate 3 | Gate 2 | Mismatch |
| Time | 14:00 | 14:00 (from "2 baje") | Match |
| Quantity | 40 bags | 40 bags | Match |

The worker wrote: "40 bori cement Gate 2 pe utaarna hai, 2 baje tak." The red card blocks confirmation until the place is fixed in the same chat.

- Object aliases: when a task is sent, other names for the object are generated from the supervisor's own words, so "sariya" or "iron rods" match "steel rods", while a different thing stays red.
- Work-hours rule: a bare hour from 1 to 6 with no morning or evening word is read as afternoon, and the card shows that reading so either person can correct it.
- "Seen 14:02 · not yet understood" on the supervisor's task card: seen is not understood.

### What stops someone clicking past the check

- The worker has no OK button. The only way forward is to say the task back.
- Confirm is refused by the server, not just hidden, until every field matches or was accepted.
- The supervisor can accept an unclear field only when the worker actually gave a value for it. A bare "OK sir", or a reply the AI could not read, leaves nothing to accept: the worker has to say it back again.
- A mismatch (red) can never be accepted. It needs a new say-back.
- A check that passed through acceptances is titled "Match, with fields the supervisor accepted", on the card and in the record.
- Both people must confirm. If a new say-back arrives while a confirm is in flight, the confirm is refused.
- Cards are posted only by the server. Typed text that starts like a card is an ordinary message.

What it does not stop: a worker who says the right words back without understanding them. It is an extra check, not a guarantee.

### At crew scale

- Crew chat: one Nexconn group channel per crew; each person reads every message in their own language.
- Task for the whole crew: one instruction goes to every worker in their language and each says it back separately.
- Roll-call board: a live card in the crew chat shows who understood and who has not. Workers never see each other's mistakes (others see only "understood" or "not yet"). The supervisor can press Confirm on a matching row right on the board.

### Safety briefing check

The crew has a safety-points list (default points, editable on the crew page, with presets: work at height, lifting, electrical). The supervisor picks 2 to 5 points and sends. Each worker says the points back in one reply. AI maps the worker's words onto the crew's list; plain code checks that every picked point was said. A roll-call shows who said all points and which points are not said yet, and a printable record is at `/briefing/<id>`. An extra check that the points were understood, not a guarantee that anyone is safe.

### Voice

Voice input uses browser speech recognition (English, Hindi, Tamil; beta languages use the browser's Bengali, Telugu and Marathi recognisers, untested); the words land in the box to read before sending. Read-aloud plays messages and task cards. Both use the browser; no audio is recorded or stored by ClarityLoop. Voice input has not been tested on a real phone yet.

### Site words, make this a task, reminders

- Site words: a crew glossary of local terms used in chat translation, in the translation of a task's object and note (pair and crew tasks), and in the list of accepted names for the object. After flagging a translation, the reader can name the wrong word; the supervisor approves or rejects suggestions. Nothing is added without approval.
- Make this a task: tap a chat message and AI pre-fills the task form. The supervisor checks it and still presses Send.
- Send again: the new-task form shows up to five recent tasks as chips; a tap fills the form.
- Remind: the supervisor can remind a worker who has not said a task back, or whose say-back still does not match (at most once per 10 minutes per task, only when the supervisor presses it). The task list has an "Overdue to say back" filter.

### Insights and records

- Insights page for the supervisor's own crew: tasks sent, said back, understood, caught before work started, most-missed fields, by language, 14-day trend. Safety briefings are there too: sent, replies, every point on the first try, and the points most often left out. A new demo room includes ten labelled sample tasks so the page is not empty.
- Download CSV on the insights page: one row per task of the crew, supervisor only.
- Printable task record (instruction, every restatement, every check, confirmations) at `/record/<taskId>`.
- Web app manifest, so it can be added to a phone's home screen. There is no service worker and no offline mode.

## Try it

Live app: https://clarityloop-theta.vercel.app

**Judge mode.** Open `/judge`. Each visitor gets a private demo room with three seeded accounts: Ravi (supervisor, English), Murugan (worker, Hindi) and Lakshmi (worker, Tamil). "Open all three" opens them side by side, or open each one on its own. The page has a step-by-step script with copy buttons (chat, meaning check, crew task, one optional safety briefing step). No sign-up is needed. Demo data is sandbox data and is marked as such.

## How it works

- **Web app:** Next.js (App Router) with React and TypeScript, hosted on Vercel.
- **Accounts and data:** Supabase Auth (email one-time code for supervisors, crew code and PIN for workers) and Postgres with row-level security, so each table is limited to the user's own crew.
- **Chat on Nexconn:**
  - Group channels: one per supervisor–worker pair and one per crew.
  - Cards are plain text messages with a prefix, posted only by the server bot: `[[CL:TASK]]` (task), `[[CL:CHECK]]` (comparison), `[[CL:STATE]]` (state change such as understood, done, seen, or a reminder), `[[CL:BOARD]]` (crew roll-call board), `[[CL:BRIEF]]` (safety briefing). A card-looking text from anyone else, or one without a real card id, is drawn as ordinary text.
  - Silent pings: the server also sends non-stored messages so open windows refresh live (board, seen, checking). They never appear in history or unread counts.
  - Read receipts, unread counts and @mentions use Nexconn's own features.
  - The browser uses `@nexconn/engine` and `@nexconn/chat` for connection, live messages and history. The server calls Nexconn's REST API with plain `fetch` and signed headers (App-Key, Nonce, Timestamp, Signature) to issue tokens, create channels, add members and post cards; it retries on the backup domain.
  - When Nexconn keys are not configured, a local transport (polling our own API) is used for development. It is labelled in the interface and is not used in the deployed app.
- **AI:** Gemini models through the Vercel AI SDK, either directly with a Google AI Studio key or through the Vercel AI Gateway. Narrow jobs, in `src/lib/server/ai.ts`:
  1. `translateText`: translate chat messages, task text and notes (site words that appear in the text are included).
  2. `objectAliases`: other names for a task's object.
  3. `extractFields`: read the worker's restatement into the five fields. It is also used to pre-fill the form for "Make this a task".
  4. `extractSafetyPoints`: say which of the crew's listed points a worker's reply mentioned.

  Every output is parsed and checked (zod schemas; code checks that numbers are kept and the text is in the right script). An invalid answer is retried once; after that a translation falls back to the original text and a say-back shows "could not check" instead of a guess. The extractor never sees the supervisor's values.
- **Comparison:** match, mismatch and unclear marks, and the safety-point check, are plain code (`src/lib/compare.ts`, `src/lib/briefing.ts`). The AI never decides whether a restatement matches and never confirms a task.
- **Model fallback:** if the first model is out of quota or overloaded, the next model in a chain is tried (`AI_FALLBACK_MODELS`).

## Run locally

Requirements: Node.js 20 or later.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:apply             # applies supabase/schema.sql
npm run dev                  # http://localhost:3000
npm test
npm run typecheck
npm run lint
```

On Vercel, `vercel env pull .env.local` fills in most of the values.

### Environment variables

Copy `.env.example` to `.env.local`. Never commit `.env.local`.

| Name | Used in | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Supabase anon (publishable) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role key; bypasses row-level security |
| `POSTGRES_URL_NON_POOLING` | Server only (`npm run db:apply`) | Direct Postgres connection string used to apply the schema |
| `NEXCONN_APP_KEY` | Browser and server | Nexconn App Key; returned to the browser by `/api/config`, public by design |
| `NEXCONN_APP_SECRET` | Server only | Nexconn App Secret |
| `NEXCONN_AREA` | Server only | `SG`, `NA` or `SA` (default `SG`); must match the data center chosen for the app in the Nexconn Console |
| `AI_MODEL` | Server only | Model id (default `google/gemini-3.5-flash-lite`) |
| `AI_FALLBACK_MODELS` | Server only, optional | Comma-separated models tried in order when the first is out of quota or busy |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Server only, optional | Google AI Studio key; when set, `google/...` models are called directly |
| `AI_GATEWAY_API_KEY` | Server only, optional | AI Gateway key; on Vercel the project's OIDC token is used instead |
| `EVAL_GAP_MS` | Eval script only, optional | Pause between model calls in `scripts/eval.mjs` |

## Tests and evals

- `npm test` runs 66 unit tests (`src/lib/*.test.ts`) with Node's test runner: the field comparison and aliases, the work-hours rule, the safety-briefing check, the roll-call board, site words, reminders, insights, the CSV export, send-again and the AI output parsing. They use no network.
- `evals/` holds fixed test sets: `translation.json` (100 translation runs across the three languages, checking that numbers and place names are kept) and `meaning.json` (15 restatements, 6 with a planted mismatch). `node --env-file=.env.local scripts/eval.mjs` runs them against the real model and writes `evals/results.json` (a copy for the site is `public/evals-results.json`).
- Stored results (run 2026-11-17 UTC, model `google/gemini-3.5-flash-lite`): translation, 100 of 100 runs kept every number and place name, median 1.95 s (p90 5.35 s); meaning check, 6 of 6 planted mismatches caught, 0 false alarms on the 9 correct restatements, median 2.25 s (p90 5.69 s). One call hit a timeout during the run.
- What they do not show: no native speaker has rated the translations, the sets are small and written by us, and no pilot with real workers has run. The translation speed target (median under 1.5 s) is not met on the current free-tier model key; the app shows the original at once and swaps the translation in.

## Security and privacy

- Secrets (Nexconn App Secret, Supabase service key, AI key) live only in server environment variables.
- Row-level security limits every table to the user's own crew. Routes also check conversation membership.
- Translation is available only to members of the conversation. A cached translation is tied to a hash of the text it was made from, so different text sent for the same message id gets a fresh translation.
- Per-user, per-minute limits on translating, sending a task or crew task, saying a task or briefing back, "Make this a task", and adding list items or site words. Sending a briefing (its note is translated) has no limit yet.
- Worker PINs are stored hashed. Attempts are counted in one atomic database step before the PIN is checked: 5 tries, then a 5-minute lock, parallel guesses included.
- Demo rooms: there is no public reset route. A room is reset only when it is handed to a new visitor; the room idle longest goes first and is claimed in one atomic update. A room in use is taken only when all seven are busy. Demo accounts keep their names.
- `/health` shows timings, error codes and the model name only to a signed-in supervisor.
- Pages cannot be framed by other sites (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).
- The app does not collect location, camera access, photos of people or attendance. It is not a monitoring tool; workers see what the supervisor sees about their own tasks.
- Only message text, the crew's place, action and safety-point lists, and matching site words are sent to the AI service. No names, phone numbers or account details are sent.
- The AI never confirms a task. Only the two people can.
- Messages are translated by an AI service; the first screen says so. Provider data-use terms are to be checked before any pilot.
- `.env*` files are git-ignored except `.env.example`. `scripts/secret-scan.sh` checks tracked and staged files for likely secrets.

## Not in this build

- Voice messages (recorded audio). Voice input and read-aloud exist; they use the browser, and the words are text.
- Phone-number sign-in
- Automatic glossary learning (site words only change when a supervisor approves)
- Scheduled or automatic reminders (a reminder is sent only when the supervisor presses Remind)
- Photos
- A shift-handover check
- A site dashboard across several crews, or multi-site admin
- Audit export beyond the task CSV and the printable task and briefing pages
- Offline mode (no service worker)
- Native-speaker review of any language; the three beta languages have no test set yet
- SMS or WhatsApp reach for workers without the app
- Single sign-on
- API or webhooks for other tools
- Billing and paid plans
- Native mobile apps (it is a web app that can be added to the home screen)
- Attendance, GPS tracking, photo proof or any monitoring of workers
- Certifying safety. ClarityLoop is an extra check, not a guarantee

## Roadmap

Planned, not built. Everything under "What it does" is built and live.

- **Pilot:** run it with a real crew; have native speakers rate the translations; get translation speed under the 1.5 s target.
- **Reach:** voice messages (transcribed and translated), phone-number sign-in, more languages, SMS or WhatsApp links for workers without the app.
- **Site product:** photos on tasks, a shift-handover check, scheduled reminders, a dashboard and audit export across crews, multi-site admin, single sign-on, API and webhooks.
- **Business:** billing and paid plans; data controls (retention, export, deletion on request, consent notices in each language).

## Evidence

The problem is motivated by the research below. These are context for the problem, not proof that the app works.

- A review of 60 studies (2000 to 2022) found language barriers to be a dominant safety risk factor for migrant construction workers. [Guan et al., ECAM, 2022](https://emerald.com/insight/content/doi/10.1108/ECAM-02-2022-0129/full/html)
- A study in southern Chennai, Tamil Nadu, of 524 construction workers, traces most injuries in its sample to basic language barriers. It covers dental and facial injuries only, so it is supporting context. [Meeral et al., Cureus, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10751618)
- Teach-back, where the listener repeats an instruction in their own words, is recommended in healthcare. A review of 26 studies found it effective for confirming understanding, with varying results. [Yen & Leasure, Federal Practitioner, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6590951)

## Team

Team **Kaching** — Vaibhav Jangid. Built for the Nexconn Build Challenge 2026 (track: Workplace & Collaboration).

## License

MIT. See [LICENSE](LICENSE).
