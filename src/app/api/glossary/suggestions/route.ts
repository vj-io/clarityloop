import { z } from "zod";
import { requireMe } from "@/lib/server/auth";
import { memberConversation } from "@/lib/server/conversations";
import { db, ok } from "@/lib/server/db";
import { body, fail, json, notFound, route } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * After "Translation looks wrong": the reader says which word was wrong (and, if they like, what it means),
 * in their own language. Stored as an open suggestion; only the supervisor can turn it into a site word.
 */
export const POST = route(async (req) => {
  const me = await requireMe(req);
  const b = await body(req, z.object({
    conversation_id: z.uuid(), message_id: z.string().min(1).max(128),
    word: z.string().trim().min(1).max(40), meaning: z.string().trim().max(120).nullish(),
  }));
  const conv = await memberConversation(b.conversation_id, me.id);
  const { data: count, error } = await db().rpc("rate_add", { p_profile: me.id, p_bucket: "term_suggest", p_window_seconds: 60, p_n: 1 });
  if (error) throw new Error(`db: ${error.message}`);
  if ((count as number) > 10) return fail(429, "rate_limited");
  ok(await db().from("term_suggestions").insert({
    crew_id: conv.crew_id, conversation_id: conv.id, nexconn_message_id: b.message_id,
    word: b.word, meaning: b.meaning || null, lang: me.language, suggested_by: me.id,
  }));
  return json({ ok: true });
});

/** Supervisor: dismiss a suggestion ("added" is set by POST /api/glossary with suggestion_id). */
export const PATCH = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  if (!me.crew_id) return notFound();
  const b = await body(req, z.object({ id: z.uuid(), status: z.literal("dismissed") }));
  const rows = ok(await db().from("term_suggestions").update({ status: b.status }).eq("id", b.id).eq("crew_id", me.crew_id).select("id"));
  if (!rows.length) return notFound();
  return json({ ok: true });
});
