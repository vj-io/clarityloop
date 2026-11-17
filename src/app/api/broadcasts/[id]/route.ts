import { requireMe } from "@/lib/server/auth";
import { broadcastDTO, loadBroadcast } from "@/lib/server/broadcasts";
import { idParam, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

/** The roll-call board in the reader's language. Members of the crew channel only; redacted for workers. */
export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req);
  return json({ broadcast: await broadcastDTO(await loadBroadcast(await idParam(ctx), me), me) });
});
