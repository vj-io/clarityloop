import { requireMe } from "@/lib/server/auth";
import { crewDTO } from "@/lib/server/crew";
import { json, notFound, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const me = await requireMe(req);
  if (!me.crew_id) return notFound();
  return json({ crew: await crewDTO(me.crew_id, me.language) });
});
