// Every card goes through card_outbox: the DB change stands even if the send fails,
// and unsent rows are retried (oldest first, max 5 attempts) on the next card post for
// that conversation and on GET /api/health.
import { BOT_USER_ID } from "../types.ts";
import { db, ok } from "./db.ts";
import { sendGroupText, transport } from "./nexconn.ts";

const MAX_ATTEMPTS = 5;
type OutboxRow = { id: string; conversation_id: string; body: string; attempts: number };

async function deliver(row: OutboxRow): Promise<string | null> {
  if (transport() === "local") {
    const m = ok(await db().from("local_messages")
      .insert({ conversation_id: row.conversation_id, from_user: BOT_USER_ID, text: row.body }).select("id").single());
    return m.id as string;
  }
  const c = ok(await db().from("conversations").select("nexconn_group_id").eq("id", row.conversation_id).single());
  return sendGroupText(c.nexconn_group_id as string, row.body);
}

/** Post a card into a conversation. Never throws because of the transport. */
export async function postCard(conversationId: string, body: string) {
  ok(await db().from("card_outbox").insert({ conversation_id: conversationId, body }));
  await Promise.all([
    db().from("conversations").update({ last_activity_at: new Date().toISOString() }).eq("id", conversationId),
    flushOutbox(conversationId),
  ]);
}

/** Send unsent cards oldest first. Returns how many are still pending. */
export async function flushOutbox(conversationId?: string): Promise<number> {
  let q = db().from("card_outbox").select("id, conversation_id, body, attempts")
    .is("sent_at", null).lt("attempts", MAX_ATTEMPTS).order("created_at").limit(50);
  if (conversationId) q = q.eq("conversation_id", conversationId);
  const rows = ok(await q) as OutboxRow[];
  const stalled = new Set<string>(); // keep card order: stop a conversation at its first failure
  let pending = 0;
  for (const row of rows) {
    if (stalled.has(row.conversation_id)) { pending++; continue; }
    // Claim the row (optimistic on attempts) so two concurrent flushes don't both send it.
    const claimed = ok(await db().from("card_outbox").update({ attempts: row.attempts + 1 })
      .eq("id", row.id).eq("attempts", row.attempts).is("sent_at", null).select("id"));
    if (!claimed.length) continue;
    try {
      const messageId = await deliver(row);
      ok(await db().from("card_outbox").update({ sent_at: new Date().toISOString(), nexconn_message_id: messageId, last_error: null }).eq("id", row.id));
    } catch (e) {
      stalled.add(row.conversation_id);
      pending++;
      await db().from("card_outbox").update({ last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }).eq("id", row.id);
    }
  }
  return pending;
}
