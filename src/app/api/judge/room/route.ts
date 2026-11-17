import { fail, json, route } from "@/lib/server/http";
import { judgeLimited, pickRoom } from "@/lib/server/sandbox";

export const runtime = "nodejs";

/**
 * A clean demo room for this visitor: the room idle longest, reset (empty chats, sample history back).
 * ponytail: two visitors arriving in the same second can be handed the same room; with seven rooms
 * and a reset per hand-out that is rare. Lock a row if judges ever queue up.
 */
export const POST = route(async (req) => {
  if (judgeLimited(req)) return fail(429, "rate_limited");
  return json({ room: await pickRoom() });
});
