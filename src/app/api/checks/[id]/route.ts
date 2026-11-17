import { requireMe } from "@/lib/server/auth";
import { idParam, json, route } from "@/lib/server/http";
import { checkView } from "@/lib/server/tasks";

export const runtime = "nodejs";

export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req);
  return json(await checkView(await idParam(ctx), me));
});
