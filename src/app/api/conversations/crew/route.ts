import { requireMe } from "@/lib/server/auth";
import { conversationDTO, ensureCrewConversation } from "@/lib/server/conversations";
import { json, notFound, route } from "@/lib/server/http";

export const runtime = "nodejs";

/** Get or create the caller's crew channel (any crew member may open it; creating it is idempotent). */
export const POST = route(async (req) => {
  const me = await requireMe(req);
  if (!me.crew_id) return notFound();
  const conv = await ensureCrewConversation(me.crew_id);
  return json({ conversation: await conversationDTO(conv, me.id) });
});
