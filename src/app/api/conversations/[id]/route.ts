import type { Lang, Role } from "@/lib/types";
import { requireMe } from "@/lib/server/auth";
import { conversationDTO, memberConversation } from "@/lib/server/conversations";
import { db, ok } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";

export const runtime = "nodejs";

type Member = { id: string; display_name: string; language: Lang; role: Role; nexconn_user_id: string };

/** The conversation plus its members keyed by nexconn_user_id (to label message senders). */
export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req);
  const conv = await memberConversation((await ctx.params).id, me.id);
  const ids = conv.kind === "crew"
    ? (ok(await db().from("conversation_members").select("profile_id").eq("conversation_id", conv.id)) as { profile_id: string }[]).map((m) => m.profile_id)
    : [conv.supervisor_id, conv.worker_id!];
  const people = ok(await db().from("profiles").select("id, display_name, language, role, nexconn_user_id").in("id", ids)) as Member[];
  const members = Object.fromEntries(people.map(({ nexconn_user_id, ...p }) => [nexconn_user_id, p]));
  return json({ conversation: await conversationDTO(conv, me.id), members });
});
