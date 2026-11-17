import { z } from "zod";
import { requireMe } from "@/lib/server/auth";
import { memberConversation } from "@/lib/server/conversations";
import { db, ok } from "@/lib/server/db";
import { body, json, notFound, route } from "@/lib/server/http";

export const runtime = "nodejs";

/** FR-21: "Translation looks wrong" on the reader's own translation of a message. */
export const POST = route(async (req) => {
  const me = await requireMe(req);
  const b = await body(req, z.object({ conversation_id: z.uuid(), message_id: z.string().min(1).max(128) }));
  const conv = await memberConversation(b.conversation_id, me.id);
  const rows = ok(await db().from("message_translations").update({ flagged: true })
    .eq("conversation_id", conv.id).eq("nexconn_message_id", b.message_id).eq("target_lang", me.language).select("nexconn_message_id"));
  if (!rows.length) return notFound();
  return json({ ok: true });
});
