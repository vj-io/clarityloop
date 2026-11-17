// Shared contracts. Everything the server, the AI layer and the UI agree on lives here.
import { z } from "zod";

export const LANGS = ["en", "hi", "ta"] as const;
export type Lang = (typeof LANGS)[number];
export const LangSchema = z.enum(LANGS);
export const LANG_NAME: Record<Lang, string> = { en: "English", hi: "हिन्दी", ta: "தமிழ்" };

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
    | "vague" | "unreadable" | "extra";
  accepted?: boolean;
};
export type FieldMarks = Record<FieldKey, FieldMark>;

// ---------- Cards: plain Nexconn text with a prefix, sent only by the server bot ----------
// [[CL:TASK]]<taskId>                      task card
// [[CL:CHECK]]<checkId>                    comparison card (red / amber / green), re-posted after an acceptance
// [[CL:STATE]]<taskId>:<event>             event = checking | confirmed | understood | done
// A card-looking text whose sender is not BOT_USER_ID is ordinary chat and must be drawn as text.
export const BOT_USER_ID = "clarityloopbot";
export const CARD = { TASK: "[[CL:TASK]]", CHECK: "[[CL:CHECK]]", STATE: "[[CL:STATE]]" } as const;
export type CardKind = keyof typeof CARD;
export type StateEvent = "checking" | "confirmed" | "understood" | "done";
export function parseCard(text: string): { kind: CardKind; id: string; event?: StateEvent } | null {
  for (const kind of Object.keys(CARD) as CardKind[]) {
    if (!text.startsWith(CARD[kind])) continue;
    const rest = text.slice(CARD[kind].length).trim();
    if (kind !== "STATE") return { kind, id: rest };
    const [id, event] = rest.split(":");
    return { kind, id, event: event as StateEvent };
  }
  return null;
}

/** One chat message as the UI sees it, whatever transport carried it. */
export type ChatMsg = { id: string; from: string; text: string; at: number };

// ---------- API DTOs (already resolved to the reader's language) ----------
export type Me = {
  id: string; display_name: string; role: Role; language: Lang;
  crew_id: string | null; nexconn_user_id: string; is_sandbox: boolean;
};
export type ListItem = { id: string; label: string; labels: Record<Lang, string> };
export type CrewDTO = {
  id: string; name: string; site_name: string; join_code: string;
  members: { id: string; display_name: string; role: Role; language: Lang }[];
  places: ListItem[]; actions: ListItem[];
};
export type ConversationDTO = {
  id: string; nexconn_group_id: string;
  other: { id: string; display_name: string; language: Lang; role: Role };
  open_tasks: number; last_activity_at: string;
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
};
export type TranslationDTO = {
  id: string;                      // nexconn message id
  text: string | null;             // null => same language, show the original
  source_lang: Lang | null; flagged: boolean; error?: boolean;
};

// ---------- HTTP contract ----------
// Every route except /api/config, /api/join, /api/worker-login, /api/judge needs
// `Authorization: Bearer <supabase access token>`. Errors: non-2xx with { error: string(code), message?: string }.
// Codes: unauthorized 401 · forbidden 403 · not_found 404 · invalid 400 · conflict 409 · locked 423 ·
//        rate_limited 429 · blocked 409 (confirm while a field is red/unclear) · ai_unavailable 503 · nexconn_unavailable 503
export type SessionGrant = { email: string; token_hash: string };   // client: supabase.auth.verifyOtp({ token_hash, type: "magiclink" })
export type Api = {
  "GET /api/config": { res: { transport: "nexconn" | "local"; nexconn_app_key: string | null; nexconn_area: "SG" | "NA" | "SA"; ai_ready: boolean } };
  "POST /api/join": { req: { join_code: string; name: string; language: Lang; pin: string }; res: SessionGrant };
  "POST /api/worker-login": { req: { join_code: string; name: string; pin: string }; res: SessionGrant };
  "POST /api/judge": { req: { role: Role }; res: SessionGrant & { conversation_id: string } };
  "GET /api/me": { res: { me: Me | null } };                       // null => signed in, no profile yet => /onboarding
  "PATCH /api/me": { req: { language?: Lang; display_name?: string }; res: { me: Me } };
  "POST /api/crews": { req: { display_name: string; language: Lang; crew_name: string; site_name: string }; res: { me: Me; crew: CrewDTO } };
  "GET /api/crew": { res: { crew: CrewDTO } };
  "POST /api/crew/lists": { req: { kind: "place" | "action"; label: string }; res: { crew: CrewDTO } };   // label in caller's language; server fills the other two
  "DELETE /api/crew/lists": { req: { kind: "place" | "action"; id: string }; res: { crew: CrewDTO } };
  "POST /api/nexconn/token": { res: { user_id: string; token: string | null } };                          // token null in local transport
  "POST /api/conversations": { req: { worker_id: string }; res: { conversation: ConversationDTO } };
  "GET /api/conversations": { res: { conversations: ConversationDTO[] } };
  "GET /api/conversations/:id": { res: { conversation: ConversationDTO; members: Record<string, { id: string; display_name: string; language: Lang; role: Role }> } }; // keyed by nexconn_user_id
  "POST /api/translate": { req: { conversation_id: string; messages: { id: string; text: string }[] }; res: { translations: TranslationDTO[] } }; // max 50 per call
  "POST /api/translate/flag": { req: { conversation_id: string; message_id: string }; res: { ok: true } };
  "POST /api/tasks": { req: { conversation_id: string; action_id: string; object_text: string; place_id: string; due_time: string; quantity?: number | null; unit?: string | null; note?: string | null }; res: { task: TaskDTO } };
  "GET /api/tasks": { res: { tasks: TaskDTO[] } };                 // supervisor: all of theirs; worker: assigned to them; newest first
  "GET /api/tasks/:id": { res: { task: TaskDTO } };
  "GET /api/checks/:id": { res: { check: CheckDTO; task: TaskDTO } };
  "POST /api/tasks/:id/restate": { req: { text: string }; res: { task: TaskDTO; check: CheckDTO } };
  "POST /api/tasks/:id/accept-field": { req: { field: FieldKey }; res: { task: TaskDTO } };
  "POST /api/tasks/:id/confirm": { res: { task: TaskDTO } };
  "POST /api/tasks/:id/done": { res: { task: TaskDTO } };
  "GET /api/health": { res: HealthDTO };
  // Local transport only (used when Nexconn keys are not configured):
  "GET /api/local/messages?conversation_id=&after=": { res: { messages: ChatMsg[] } };   // after = ms timestamp, exclusive
  "POST /api/local/messages": { req: { conversation_id: string; text: string }; res: { message: ChatMsg } };
};
export type HealthDTO = {
  transport: "nexconn" | "local"; nexconn_configured: boolean; ai_ready: boolean; ai_model: string;
  db_ok: boolean; pending_cards: number;
  timings: Record<string, { n: number; median_ms: number | null; errors: number }>;   // by health_events.kind
  last_errors: { kind: string; code: string | null; at: string }[];
};
