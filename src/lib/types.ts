// Shared contracts. Everything the server, the AI layer and the UI agree on lives here.
import { z } from "zod";

export const CORE_LANGS = ["en", "hi", "ta"] as const;
/** Beta: interface text is machine-written and not yet checked by a native speaker (src/i18n/beta/). */
export const BETA_LANGS = ["bn", "te", "mr"] as const;
export const LANGS = [...CORE_LANGS, ...BETA_LANGS] as const;
export type CoreLang = (typeof CORE_LANGS)[number];
export type BetaLang = (typeof BETA_LANGS)[number];
export type Lang = (typeof LANGS)[number];
export const LangSchema = z.enum(LANGS);
export const LANG_NAME: Record<Lang, string> = { en: "English", hi: "हिन्दी", ta: "தமிழ்", bn: "বাংলা", te: "తెలుగు", mr: "मराठी" };
export const isBeta = (l: Lang): l is BetaLang => (BETA_LANGS as readonly string[]).includes(l);
/** Text per language: always the three core languages, a beta language only where it has been written. */
export type Labels = Record<CoreLang, string> & Partial<Record<BetaLang, string>>;
/** The reader's text, or English where their (beta) language has none. */
export const inLang = (v: Labels, l: Lang): string => v[l] || v.en;

export type Role = "supervisor" | "worker";
export type I18n = Partial<Record<Lang, string>>;

export const FIELDS = ["action", "object", "place", "time", "quantity"] as const;
export type FieldKey = (typeof FIELDS)[number];
export type Mark = "match" | "mismatch" | "unclear";
export type Overall = "mismatch" | "needs_look" | "all_match";
export type TaskState =
  | "waiting" | "checking" | "mismatch" | "needs_look" | "all_match" | "understood" | "done";

/** PRD "Extraction contract". ids are the crew's own action/place ids, or "unknown". */
export const ExtractionSchema = z.object({
  action: z.string().min(1),
  object: z.string().nullable(),
  object_maybe_same: z.boolean(),
  place: z.string().min(1),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  time_ambiguous: z.boolean(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  gloss_en: z.string().min(1).max(300),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** What the supervisor set. Compared by code, never shown to the extractor. */
export type TaskFields = {
  action_id: string;
  object_en: string;
  /** Other accepted names for the object, made from the supervisor's own words at task creation. */
  object_aliases?: string[];
  place_id: string;
  due_time: string; // HH:MM 24h
  quantity: number | null;
  unit: string | null;
};

/**
 * One row of the comparison card. `supervisor` / `worker` are raw values:
 * an action/place id, an English object phrase, "HH:MM", or "40 bags".
 * The API resolves ids to labels in the reader's language.
 */
export type FieldMark = {
  mark: Mark;
  supervisor: string | null;
  worker: string | null;
  /** machine-readable reason, shown as a short hint */
  reason?:
    | "not_mentioned" | "unknown" | "afternoon_assumed" | "hour_ambiguous"
    | "vague" | "unreadable" | "extra" | "unit";
  accepted?: boolean;
};
export type FieldMarks = Record<FieldKey, FieldMark>;

// ---------- Cards: plain Nexconn text with a prefix, sent only by the server bot ----------
// [[CL:TASK]]<taskId>                      task card
// [[CL:CHECK]]<checkId>                    comparison card (red / amber / green), re-posted after an acceptance
// [[CL:STATE]]<taskId>:<event>             event = checking | confirmed | understood | done
// [[CL:BOARD]]<broadcastId>                roll-call board of a crew task (crew channel)
// [[CL:STATE]]<broadcastId>:board          ping: a child task of that crew task changed; refetch the board
// A card-looking text whose sender is not BOT_USER_ID is ordinary chat and must be drawn as text.
export const BOT_USER_ID = "clarityloopbot";
// [[CL:BRIEF]]<briefingId>                 safety briefing: roll call in the crew channel; the worker's card in each pair chat (re-posted there after each reply)
// [[CL:STATE]]<briefingId>:brief           ping: a reply to that briefing changed; refetch it
export const CARD = { TASK: "[[CL:TASK]]", CHECK: "[[CL:CHECK]]", STATE: "[[CL:STATE]]", BOARD: "[[CL:BOARD]]", BRIEF: "[[CL:BRIEF]]" } as const;
export type CardKind = keyof typeof CARD;
// [[CL:STATE]]<taskId>:nudge               the supervisor's "Remind": a stored, visible line (not silent)
export type StateEvent = "checking" | "confirmed" | "understood" | "done" | "board" | "seen" | "nudge" | "brief";
/** "Remind": only while the task still needs a say-back, at most once per task per NUDGE_GAP_MS (server-enforced). */
export const NUDGE_GAP_MS = 10 * 60_000;
export const NUDGE_STATES: TaskState[] = ["waiting", "mismatch", "needs_look"];
/** Seconds until another reminder is allowed (0 = now). */
export const nudgeWait = (nudgedAt: string | null | undefined, now = Date.now()) =>
  nudgedAt ? Math.max(0, Math.ceil((Date.parse(nudgedAt) + NUDGE_GAP_MS - now) / 1000)) : 0;
export function parseCard(text: string): { kind: CardKind; id: string; event?: StateEvent } | null {
  for (const kind of Object.keys(CARD) as CardKind[]) {
    if (!text.startsWith(CARD[kind])) continue;
    const rest = text.slice(CARD[kind].length).trim();
    const [id, event] = kind === "STATE" ? rest.split(":") : [rest];
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;   // typed text that merely starts like a card is an ordinary message
    return kind === "STATE" ? { kind, id, event: event as StateEvent } : { kind, id };
  }
  return null;
}

/** One chat message as the UI sees it, whatever transport carried it. */
export type ChatMsg = {
  id: string; from: string; text: string; at: number;
  /** Nexconn only: the sender asked for read receipts / this client already sent its receipt / @mentioned user ids */
  needReceipt?: boolean; sentReceipt?: boolean; mentions?: string[];
};

// ---------- API DTOs (already resolved to the reader's language) ----------
export type Me = {
  id: string; display_name: string; role: Role; language: Lang;
  crew_id: string | null; nexconn_user_id: string; is_sandbox: boolean;
};
export type ListItem = { id: string; label: string; labels: Labels };
export type CrewDTO = {
  id: string; name: string; site_name: string; join_code: string;
  members: { id: string; display_name: string; role: Role; language: Lang }[];
  places: ListItem[]; actions: ListItem[];
  /** Safety points list (optional for backward compatibility). `key` names a default point, for templates. */
  safety_points?: (ListItem & { key: string | null })[];
};
export type ConversationDTO = {
  id: string; nexconn_group_id: string;
  other: { id: string; display_name: string; language: Lang; role: Role };
  open_tasks: number; last_activity_at: string;
  /** Crew scale (optional for backward compatibility). For kind "crew", `other` is a stand-in named after the crew. */
  kind?: "pair" | "crew"; title?: string; member_count?: number;
};
export type CheckRow = { field: FieldKey; mark: Mark; supervisor: string; worker: string; reason?: FieldMark["reason"]; accepted?: boolean };
export type CheckDTO = {
  id: string; task_id: string; overall: Overall; created_at: string;
  rows: CheckRow[];                // labels in the reader's language
  restatement: { text: string; language: Lang; translated: string | null };
  gloss: string;                   // "what we understood", reader's language
  gloss_other: string;             // same, in the other person's language
  unreadable: boolean;             // AI answer was invalid twice
};
export type TaskDTO = {
  id: string; conversation_id: string; state: TaskState; is_sandbox: boolean; created_at: string;
  action: string; object: string; place: string; due_time: string;
  quantity: number | null; unit: string | null; note: string | null;
  supervisor: { id: string; name: string }; worker: { id: string; name: string };
  confirmations: { profile_id: string; confirmed_at: string }[];
  latest_check: CheckDTO | null;
  understood_at: string | null; done_at: string | null;
  seen_at?: string | null;          // when the worker first had the task card on screen
  nudged_at?: string | null;        // the supervisor's last "Remind"
  broadcast_id?: string | null; is_safety?: boolean;   // set when the task is one worker's copy of a crew task
  is_sample?: boolean;              // sandbox sample history (not sent by the visitor)
};
/**
 * Roll-call board row. Workers see other workers redacted: status is only "understood" or "not_yet",
 * with no fields and no task/conversation ids (no one is shown up in front of the crew).
 */
export type BoardStatus = TaskState | "not_yet";
export type BoardRow = {
  worker: { id: string; name: string; language: Lang };
  status: BoardStatus;
  is_me: boolean;
  task_id: string | null;           // null when redacted
  conversation_id: string | null;   // the worker's pair conversation; null when redacted
  issues: { field: FieldKey; mark: Mark; supervisor: string; worker: string }[];   // empty when redacted
};
export type BroadcastDTO = {
  id: string; conversation_id: string; created_at: string; is_safety: boolean; is_sandbox: boolean;
  action: string; object: string; place: string; due_time: string;
  quantity: number | null; unit: string | null; note: string | null;
  supervisor: { id: string; name: string };
  rows: BoardRow[];
  progress: { understood: number; total: number };   // understood counts understood + done
  redacted: boolean;
};
// ---------- Safety briefing check (labels already in the reader's language) ----------
export type BriefingState = "waiting" | "missed" | "understood";
/** Roll-call row. Redacted for workers looking at others: status only "understood" / "not_yet", no points, no chat id. */
export type BriefingRow = {
  worker: { id: string; name: string; language: Lang };
  status: BriefingState | "not_yet"; is_me: boolean;
  said: number | null;              // picked points said so far; null when redacted
  missing: string[];                // picked point ids not said yet; empty when redacted
  conversation_id: string | null;   // the worker's pair chat; null when redacted
};
export type BriefingAttemptDTO = {
  at: string; text: string; language: Lang;
  said_point_ids: string[];         // listed points this reply mentioned (any of the crew's list)
  unreadable: boolean;              // the AI could not check this reply: nothing changed
  gloss: string | null;             // "what we understood", reader's language (English if not translated)
};
export type BriefingReplyDTO = {
  worker: { id: string; name: string; language: Lang }; conversation_id: string;
  state: BriefingState; understood_at: string | null;
  said: string[]; missing: string[]; extra: string[];   // picked said / picked not said / mentioned but not in this briefing
  attempts: BriefingAttemptDTO[];   // oldest first
};
export type BriefingDTO = {
  id: string; conversation_id: string; created_at: string; is_sandbox: boolean;
  supervisor: { id: string; name: string; language: Lang };
  points: { id: string; label: string; labels: Labels }[];   // picked, in order
  /** every listed point a reply mentioned that is not in `points` (for "also mentioned") */
  other_points: { id: string; label: string }[];
  place: string | null; note: string | null;
  rows: BriefingRow[];
  progress: { understood: number; total: number };
  redacted: boolean;
  replies: BriefingReplyDTO[];      // supervisor: every worker; worker: only their own
};
export type BriefingSummary = Pick<BriefingDTO, "id" | "conversation_id" | "created_at" | "points" | "progress">;
export type BroadcastSummary = Pick<BroadcastDTO,"id" | "conversation_id" | "created_at" | "is_safety" | "action" | "object" | "place" | "due_time" | "progress">;
export type TranslationDTO = {
  id: string;                      // nexconn message id
  text: string | null;             // null => same language, show the original
  source_lang: Lang | null; flagged: boolean; error?: boolean;
};
/** A site word: how people on this site write a thing, and what it means in each language. */
export type TermDTO = { id: string; term: string; meanings: Labels; note: string | null; source: "manual" | "flag"; created_at: string };
export type SuggestionDTO = { id: string; word: string; meaning: string | null; lang: Lang; by: string; created_at: string };
/** "Make this a task": fields read from a chat message. null = not found. Never saved by the server. */
export type TaskDraft = {
  action_id: string | null; object_text: string | null; place_id: string | null;
  due_time: string | null; time_assumed: boolean; quantity: number | null; unit: string | null;
};

// ---------- HTTP contract ----------
// Every route except /api/config, /api/join, /api/worker-login, /api/judge needs
// `Authorization: Bearer <supabase access token>`. Errors: non-2xx with { error: string(code), message?: string }.
// Codes: unauthorized 401 · forbidden 403 · not_found 404 · invalid 400 · conflict 409 · locked 423 ·
//        rate_limited 429 · blocked 409 (confirm while a field is red/unclear) · ai_unavailable 503 · nexconn_unavailable 503
export type SessionGrant = { access_token: string; refresh_token: string };   // client: supabase.auth.setSession(grant)
export type Api = {
  "GET /api/config": { res: { transport: "nexconn" | "local"; nexconn_app_key: string | null; nexconn_area: "SG" | "NA" | "SA" } };
  "POST /api/join": { req: { join_code: string; name: string; language: Lang; pin: string }; res: SessionGrant };
  "POST /api/worker-login": { req: { join_code: string; name: string; pin: string }; res: SessionGrant };
  "POST /api/judge": { req: { role: Role; fresh?: boolean; worker?: "murugan" | "lakshmi"; room?: number }; res: SessionGrant & { conversation_id: string; crew_conversation_id?: string; room?: number } };
  "POST /api/judge/room": { res: { room: number } };   // a clean private demo room for this visitor
  "GET /api/me": { res: { me: Me | null } };                       // null => signed in, no profile yet => /onboarding
  "PATCH /api/me": { req: { language?: Lang; display_name?: string }; res: { me: Me } };
  "POST /api/crews": { req: { display_name: string; language: Lang; crew_name: string; site_name: string }; res: { me: Me; crew: CrewDTO } };
  "GET /api/crew": { res: { crew: CrewDTO } };
  "POST /api/crew/lists": { req: { kind: "place" | "action" | "safety"; label: string }; res: { crew: CrewDTO } };   // label in caller's language; server fills the other two
  "DELETE /api/crew/lists": { req: { kind: "place" | "action" | "safety"; id: string }; res: { crew: CrewDTO } };
  "POST /api/nexconn/token": { res: { user_id: string; token: string | null } };                          // token null in local transport
  "POST /api/conversations": { req: { worker_id: string }; res: { conversation: ConversationDTO } };
  "GET /api/conversations": { res: { conversations: ConversationDTO[] } };   // the crew channel (kind "crew") comes first
  "POST /api/conversations/crew": { res: { conversation: ConversationDTO } };   // get or create the caller's crew channel
  "GET /api/conversations/:id": { res: { conversation: ConversationDTO; members: Record<string, { id: string; display_name: string; language: Lang; role: Role }> } }; // keyed by nexconn_user_id
  "POST /api/translate": { req: { conversation_id: string; messages: { id: string; text: string }[]; cached_only?: boolean }; res: { translations: TranslationDTO[] } }; // max 50 per call
  "POST /api/translate/flag": { req: { conversation_id: string; message_id: string }; res: { ok: true } };
  "POST /api/tasks": { req: { conversation_id: string; action_id: string; object_text: string; place_id: string; due_time: string; quantity?: number | null; unit?: string | null; note?: string | null }; res: { task: TaskDTO } };
  "GET /api/tasks": { res: { tasks: TaskDTO[] } };
  "POST /api/broadcasts": { req: { action_id: string; object_text: string; place_id: string; due_time: string; quantity?: number | null; unit?: string | null; note?: string | null; is_safety?: boolean }; res: { broadcast: BroadcastDTO } };
  "GET /api/broadcasts": { res: { broadcasts: BroadcastSummary[] } };   // supervisor: recent, newest first
  "GET /api/broadcasts/:id": { res: { broadcast: BroadcastDTO } };      // crew channel members; redacted for workers                 // supervisor: all of theirs; worker: assigned to them; newest first
  "GET /api/tasks/:id": { res: { task: TaskDTO } };
  "GET /api/checks/:id": { res: { check: CheckDTO; task: TaskDTO } };
  "POST /api/tasks/:id/restate": { req: { text: string }; res: { task: TaskDTO; check: CheckDTO } };
  "POST /api/tasks/:id/accept-field": { req: { field: FieldKey }; res: { task: TaskDTO } };
  "POST /api/tasks/:id/confirm": { res: { task: TaskDTO } };
  "POST /api/tasks/:id/done": { res: { task: TaskDTO } };
  "POST /api/tasks/:id/seen": { res: { ok: true } };                // assigned worker: the task card was on screen
  // Site words, "Make this a task", reminders
  "GET /api/glossary": { res: { terms: TermDTO[]; suggestions: SuggestionDTO[] } };   // crew members; suggestions: supervisor only ([] for workers)
  "POST /api/glossary": { req: { term: string; meaning: string; lang?: Lang; suggestion_id?: string }; res: { term: TermDTO } };   // supervisor; other two meanings filled by translation
  "PATCH /api/glossary": { req: { id: string; term?: string; meaning_en?: string; meaning_hi?: string; meaning_ta?: string; meanings_beta?: Partial<Record<BetaLang, string>>; note?: string | null }; res: { term: TermDTO } };
  "DELETE /api/glossary": { req: { id: string }; res: { ok: true } };
  "POST /api/glossary/suggestions": { req: { conversation_id: string; message_id: string; word: string; meaning?: string | null }; res: { ok: true } };   // any member, in their language
  "PATCH /api/glossary/suggestions": { req: { id: string; status: "dismissed" }; res: { ok: true } };   // supervisor
  "POST /api/tasks/draft": { req: { conversation_id: string; text: string; language?: Lang }; res: { draft: TaskDraft | null } };   // supervisor; nothing is saved
  "POST /api/tasks/:id/nudge": { res: { task: TaskDTO } };          // task's supervisor; 429 rate_limited within 10 min of the last one
  "GET /api/health": { res: HealthDTO };
  "GET /api/insights": { res: InsightsDTO };                       // supervisor of the crew only; read-only
  "GET /api/insights/export": { res: string };                    // same guard; text/csv (UTF-8 with BOM), one row per task
  "GET /api/tasks/recent": { res: { recent: RecentTask[] } };      // supervisor: up to 5 distinct recent tasks of their crew, for "Send again"
  "GET /api/tasks/:id/record": { res: RecordDTO };                 // members of the task's conversation; read-only
  // Safety briefing check: 2-5 points from the crew's safety list; each worker says them back once.
  "POST /api/briefings": { req: { point_ids: string[]; place_id?: string | null; note?: string | null }; res: { briefing: BriefingDTO } };   // supervisor
  "GET /api/briefings": { res: { briefings: BriefingSummary[] } };   // supervisor: recent, newest first
  "GET /api/briefings/:id": { res: { briefing: BriefingDTO } };      // crew channel members; redacted for workers; the full record
  "POST /api/briefings/:id/reply": { req: { text: string }; res: { briefing: BriefingDTO } };   // the worker: one reply covering all points
  // Local transport only (used when Nexconn keys are not configured):
  "GET /api/local/messages?conversation_id=&after=": { res: { messages: ChatMsg[] } };   // after = ms timestamp, exclusive
  "POST /api/local/messages": { req: { conversation_id: string; text: string }; res: { message: ChatMsg } };
};
export type HealthDTO = {
  transport: "nexconn" | "local"; nexconn_configured: boolean; ai_ready: boolean; ai_model?: string;   // model, timings and last_errors: signed-in supervisor only
  db_ok: boolean; pending_cards: number;
  timings: Record<string, { n: number; median_ms: number | null; errors: number }>;   // by health_events.kind
  last_errors: { kind: string; code: string | null; at: string }[];
};

// ---------- Business screens: /insights and /record/:taskId ----------
/** Every share is a whole percent, or null when its denominator is 0. All numbers come from one query of the crew's own tasks. */
export type InsightsDTO = {
  crew: { name: string; site_name: string; is_sandbox: boolean };
  generated_at: string;
  totals: {
    sent: number;
    restated: number; restated_pct: number | null;          // tasks with >= 1 restatement
    understood: number; understood_pct: number | null;      // state understood or done
    checked: number;                                        // tasks with >= 1 check
    caught: number;                                         // first check mismatch/needs_look, task later understood/done
    median_minutes_to_understood: number | null;
  };
  fields: { field: FieldKey; checked: number; mismatch: number; unclear: number }[];   // first check of each task
  languages: { language: Lang; tasks: number; retried: number; retried_pct: number | null }[];   // retried = 2+ restatements
  workers: { id: string; name: string; language: Lang; tasks: number; retried: number }[];       // A-Z by name, never ranked
  trend: { date: string; sent: number; first_try: number }[];                                    // last 14 days, oldest first (IST days)
  recent: { id: string; object: string; worker: string; state: TaskState; created_at: string; restatements: number }[];
  /** Safety briefings of the same crew (optional for backward compatibility). */
  briefings?: BriefingInsights;
};
/**
 * `expected` = one per worker per briefing; `replied` = those with at least one reply;
 * `first_try` = those whose first reply the AI could read named every picked point.
 * `missed`: picked points left out of that first reply, most often first (at most 5), labels in the reader's language.
 */
export type BriefingInsights = {
  sent: number; expected: number; replied: number; first_try: number;
  missed: { id: string; label: string; missed: number; of: number }[];
};
/** "Send again": the fields of an earlier task, as the supervisor wrote them. `sample` = sandbox sample history, not sent by the visitor. */
export type RecentTask = { action_id: string; object_text: string; place_id: string; quantity: number | null; unit: string | null; sample: boolean };
export type RecordCheck = {
  id: string; overall: Overall; created_at: string; unreadable: boolean;
  rows: CheckRow[];                                          // labels in the reader's language
  gloss: string;                                             // what the AI understood, reader's language
  accepted: { field: FieldKey; by: string; at: string }[];
};
export type RecordDTO = {
  task: {
    id: string; state: TaskState; is_sandbox: boolean; created_at: string; understood_at: string | null; done_at: string | null;
    due_time: string; quantity: number | null; unit: string | null;
    supervisor: { id: string; name: string; language: Lang }; worker: { id: string; name: string; language: Lang };
    reader: { action: string; object: string; place: string; note: string | null };      // reader's language
    original: { language: Lang; action: string; object: string; place: string; note: string | null };  // as the supervisor wrote it
  };
  restatements: {
    id: string; created_at: string; by: string; language: Lang; text: string;
    translated: string | null;                               // reader's language; null when same language or never translated
    checks: RecordCheck[];
  }[];
  confirmations: { by: string; at: string }[];
  events: { id: string; type: string; by: string | null; at: string; detail: string }[];
};
