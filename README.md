# ClarityLoop

**Read is not understood.**

ClarityLoop is a work chat where two people who don't share a language can talk normally, each reading and writing in their own language. Important instructions then get a meaning check before work starts: the worker restates the task, and any difference in task, place, time or quantity is shown live to both people.

## What it does

It has two layers in the same conversation.

1. **Chat in your own language.** Every message is shown in the reader's language, with the original one tap away. The MVP supports English, Hindi (including Hinglish typed in Roman letters) and Tamil.
2. **Meaning check for instructions.** When a supervisor sends a message as a task, the worker must restate it in their own words. A Meaning Mismatch card compares each field (action, object, place, time, quantity) and blocks confirmation until both people agree. There is no OK button.

Worked example from the product spec. The supervisor sends:

| Field | Supervisor sent | Worker restated | Result |
| --- | --- | --- | --- |
| Action | Unload | Unload | Match |
| Object | cement bags | cement bags | Match |
| Place | Gate 3 | Gate 2 | Mismatch |
| Time | 14:00 | 14:00 (from "2 baje") | Match |
| Quantity | 40 bags | 40 bags | Match |

The worker restated it as: "40 bori cement Gate 2 pe utaarna hai, 2 baje tak." The red card blocks confirmation until the place is fixed in the same chat.

## Try it

Live app: https://clarityloop-theta.vercel.app

**Judge mode.** Open `/judge` to sign in two seeded accounts in two tabs: an English-speaking supervisor and a Hindi-speaking worker. Judge-mode data is sandbox data and is marked as such. No sign-up is needed.

## How it works

- **Web app:** Next.js (App Router) with React and TypeScript, hosted on Vercel (Node runtime).
- **Accounts and data:** Supabase Auth (email one-time code for supervisors, PIN for workers) and Postgres with row-level security, so each table is limited to the user's own crew.
- **Chat:** each supervisor–worker pair has one Nexconn group channel. The browser uses `@nexconn/engine` and `@nexconn/chat` for live messages. The server uses `@nexconn/server-sdk` and Nexconn's REST API, with signed headers, to create channels, add members and post cards.
- **Cards:** task, result and state cards are plain text with a prefix (`[[CL:TASK]]`, `[[CL:CHECK]]`, `[[CL:STATE]]`). Only the server posts them. A card typed by a user is ignored.
- **AI:** called through the Vercel AI Gateway for three narrow jobs: translate chat messages, translate task text, and extract fields from the worker's restatement into a JSON contract checked with zod.
- **Comparison:** the match, mismatch and unclear marks are produced by plain code in `src/lib/compare.ts`. The AI never decides whether a restatement matches, and never confirms a task.
- **Work-hours rule:** a bare hour from 1 to 6 with no morning or evening word is read as afternoon (13:00 to 18:00). The card shows that reading so either person can correct it.
- **Local development fallback:** when Nexconn keys are not configured, the app uses a local transport for development. It is labelled as such in the interface and is not used in a deployed app.

## Run locally

Requirements: Node.js 20 or later.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:apply             # applies supabase/schema.sql
npm run dev                  # http://localhost:3000
npm test
```

On Vercel, `vercel env pull .env.local` fills in most of the values.

## Environment variables

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
| `AI_MODEL` | Server only | AI Gateway model id (default `google/gemini-3.5-flash-lite`) |
| `AI_GATEWAY_API_KEY` | Server only, optional | AI Gateway key; on Vercel the project's OIDC token is used instead |

## Security and privacy

- Secrets (Nexconn App Secret, Supabase service key, AI key) live only in server environment variables.
- Row-level security limits every table to the user's own crew. Routes also check conversation membership.
- Translation is available only to members of the conversation, with a per-user rate limit.
- Worker PINs are stored hashed, with a short lockout after repeated wrong tries.
- The app does not collect location, camera access, photos of people or attendance. It is not a monitoring tool.
- Only message text and the crew's place and action lists are sent to the AI service. No names, phone numbers or account details are sent.
- The AI never confirms a task. Only the two people can.
- Messages are translated by an AI service; the first screen says so. Provider data-use terms are to be checked before any pilot.
- `.env*` files are git-ignored except `.env.example`. `scripts/secret-scan.sh` checks tracked and staged files for likely secrets.

## Not in this build

- Attendance, GPS tracking, photo proof or any monitoring of workers
- Voice or video calls, and voice messages
- Scheduling, payroll or HR features
- Certifying safety. ClarityLoop is an extra check, not a guarantee
- Native mobile apps
- Web push notifications
- More than three languages

## Roadmap

These are planned, not built. Each phase starts only after the previous one passes its gate with real sites.

**Pilot-ready**
- Voice messages (transcribed and translated), read-aloud, and phone-number sign-in
- Crew-wide chat with translation, a site glossary learned from "Translation looks wrong" flags, and tasks for several workers
- Reminders for unrestated tasks, an offline queue, and a "Make this a task" action from chat

**Site product**
- Safety briefing check, safety templates for high-risk work, and a shift handover check
- Site dashboard and a PDF audit export of what was instructed, translated, restated and confirmed

**Scale**
- Multi-site admin, roles and single sign-on
- Reaching workers without the app through SMS or WhatsApp links, and API and webhooks for project tools
- Data controls: retention, export and deletion on request, and consent notices in each language

## Evidence

The problem is motivated by the research below. These are context for the problem, not proof that the app works.

- A review of 60 studies (2000 to 2022) found language barriers to be a dominant safety risk factor for migrant construction workers. [Guan et al., ECAM, 2022](https://emerald.com/insight/content/doi/10.1108/ECAM-02-2022-0129/full/html)
- A study in southern Chennai, Tamil Nadu, of 524 construction workers, traces most injuries in its sample to basic language barriers. It covers dental and facial injuries only, so it is supporting context. [Meeral et al., Cureus, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10751618)
- Teach-back, where the listener repeats an instruction in their own words, is recommended in healthcare. A review of 26 studies found it effective for confirming understanding, with varying results. [Yen & Leasure, Federal Practitioner, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6590951)

## License

MIT. See [LICENSE](LICENSE).
