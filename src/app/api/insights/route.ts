import { requireMe } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { loadInsights } from "@/lib/server/insights";

export const runtime = "nodejs";

/** Where do instructions go wrong on my site? Supervisor of the crew only; read-only. */
export const GET = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  return json(await loadInsights(me));
});
