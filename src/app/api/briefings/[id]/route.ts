import { requireMe } from "@/lib/server/auth";
import { briefingDTO, loadBriefing } from "@/lib/server/briefings";
import { idParam, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

/** The briefing in the reader's language: roll call, points, replies, times (also the printable record).
 *  Members of the crew channel only; a worker sees only their own reply and others as understood / not yet. */
export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req);
  return json({ briefing: await briefingDTO(await loadBriefing(await idParam(ctx), me), me) });
});
