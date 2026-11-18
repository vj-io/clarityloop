import { z } from "zod";
import { parseCard, type Lang, type TranslationDTO } from "@/lib/types";
import { AI_MODEL, translateText } from "@/lib/server/ai";
import { requireMe } from "@/lib/server/auth";
import { memberConversation } from "@/lib/server/conversations";
import { crewLists } from "@/lib/server/crew";
import { db, logHealth, ok } from "@/lib/server/db";
import { cachedIsStale, crewTerms, siteTerm } from "@/lib/server/terms";
import { body, fail, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

const Body = z.object({
  conversation_id: z.uuid(),
  messages: z.array(z.object({ id: z.string().min(1).max(128), text: z.string().min(1).max(4000) })).min(1).max(50),
});
const MAX_AI = 12, FANOUT = 3;
const PER_MINUTE = 120; // uncached translations per user; two 50-message history batches fit

type Cached = { nexconn_message_id: string; text: string; source_lang: Lang | null; flagged: boolean; terms_version: number | null };

/**
 * FR-7: the reader's translation of each message, cached per (message id, reader language).
 * ponytail: the server trusts the text a member sends for a message id (it does not re-fetch it
 * from Nexconn), so a member could cache a wrong text for their own conversation. Re-fetch via the
 * Nexconn history API if that ever matters.
 */
export const POST = route(async (req) => {
  const me = await requireMe(req);
  const b = await body(req, Body);
  const conv = await memberConversation(b.conversation_id, me.id);
  const lang = me.language;

  // the crew's site words, loaded once: they steer new translations and mark stale cached ones (see cachedIsStale)
  const [rows, glossary] = await Promise.all([
    db().from("message_translations").select("nexconn_message_id, text, source_lang, flagged, terms_version")
      .eq("conversation_id", conv.id).eq("target_lang", lang).in("nexconn_message_id", b.messages.map((m) => m.id)),
    crewTerms(conv.crew_id),
  ]);
  const terms = glossary.rows.map(siteTerm);
  const cached = new Map((ok(rows) as Cached[])
    .filter((c) => !cachedIsStale(c.terms_version, glossary.version, b.messages.find((m) => m.id === c.nexconn_message_id)!.text, terms))
    .map((c) => [c.nexconn_message_id, c]));
  const todo = b.messages.filter((m) => !cached.has(m.id) && !parseCard(m.text)); // cards are drawn from data, never translated
  if (todo.length) {
    const { data: count, error } = await db().rpc("rate_add", { p_profile: me.id, p_bucket: "translate", p_window_seconds: 60, p_n: todo.length });
    if (error) throw new Error(`db: ${error.message}`);
    if ((count as number) > PER_MINUTE) return fail(429, "rate_limited");
  }
  const lists = todo.length ? await crewLists(conv.crew_id) : { places: [], actions: [] };

  // The AI provider allows only a few requests per minute on a free key, and a history batch can hold
  // 50 uncached messages. Translate at most MAX_AI newest ones per call, FANOUT at a time; older ones
  // come back as error (the reader taps to retry), so a burst can never drain the provider quota.
  const allowed = new Set(todo.slice(-MAX_AI).map((m) => m.id));
  let running = 0;
  const waiters: (() => void)[] = [];
  const slot = async () => { if (running >= FANOUT) await new Promise<void>((r) => waiters.push(r)); running++; };
  const free = () => { running--; waiters.shift()?.(); };

  const translations: TranslationDTO[] = await Promise.all(b.messages.map(async (m): Promise<TranslationDTO> => {
    if (parseCard(m.text)) return { id: m.id, text: null, source_lang: null, flagged: false };
    const c = cached.get(m.id);
    // A cached "same language" row stores source_lang = target and empty text.
    if (c) return { id: m.id, text: c.source_lang === lang ? null : c.text, source_lang: c.source_lang, flagged: c.flagged };
    if (!allowed.has(m.id)) return { id: m.id, text: null, source_lang: null, flagged: false, error: true };
    await slot();
    const t0 = Date.now();
    try {
      const t = await translateText(m.text, lang, lists, undefined, terms);
      const ms = Date.now() - t0;
      await Promise.all([
        db().from("message_translations").upsert({
          nexconn_message_id: m.id, conversation_id: conv.id, target_lang: lang,
          source_lang: t?.source_lang ?? lang, text: t?.text ?? "", model_id: AI_MODEL, ms,
          terms_version: glossary.version, flagged: false,
        }),   // overwrites a stale row; a parallel first translation of the same message writes the same thing
        logHealth("translate", true, null, ms),
      ]);
      return { id: m.id, text: t?.text ?? null, source_lang: t?.source_lang ?? lang, flagged: false };
    } catch {
      await logHealth("translate", false, "ai_error", Date.now() - t0);
      return { id: m.id, text: null, source_lang: null, flagged: false, error: true };
    } finally { free(); }
  }));
  return json({ translations });
});
