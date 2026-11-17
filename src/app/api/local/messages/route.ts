import { z } from "zod";
import type { ChatMsg } from "@/lib/types";
import { requireMe } from "@/lib/server/auth";
import { memberConversation } from "@/lib/server/conversations";
import { db, ok } from "@/lib/server/db";
import { body, json, notFound, route } from "@/lib/server/http";
import { transport } from "@/lib/server/nexconn";

export const runtime = "nodejs";

// Stand-in chat transport while Nexconn keys are not configured. 404 in nexconn transport.
type Row = { id: string; from_user: string; text: string; created_at: string };
const toMsg = (r: Row): ChatMsg => ({ id: r.id, from: r.from_user, text: r.text, at: Math.floor(Date.parse(r.created_at)) });

export const GET = route(async (req) => {
  if (transport() !== "local") return notFound();
  const me = await requireMe(req);
  const q = new URL(req.url).searchParams;
  const conv = await memberConversation(q.get("conversation_id") ?? "", me.id);
  const after = Number(q.get("after") ?? 0) || 0;
  // ponytail: ms-precision cursor; two messages in the same millisecond across polls could be missed.
  const rows = ok(await db().from("local_messages").select("id, from_user, text, created_at").eq("conversation_id", conv.id)
    .gte("created_at", new Date(after + 1).toISOString()).order("created_at").limit(200)) as Row[];
  return json({ messages: rows.map(toMsg) });
});

/** A user message. Card-looking text is stored as the user's own text: only the bot's cards are cards. */
export const POST = route(async (req) => {
  if (transport() !== "local") return notFound();
  const me = await requireMe(req);
  const b = await body(req, z.object({ conversation_id: z.uuid(), text: z.string().trim().min(1).max(4000) }));
  const conv = await memberConversation(b.conversation_id, me.id);
  const row = ok(await db().from("local_messages").insert({ conversation_id: conv.id, from_user: me.nexconn_user_id, text: b.text })
    .select("id, from_user, text, created_at").single()) as Row;
  await db().from("conversations").update({ last_activity_at: row.created_at }).eq("id", conv.id);
  return json({ message: toMsg(row) });
});
