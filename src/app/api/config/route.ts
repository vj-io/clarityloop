import type { Api } from "@/lib/types";
import { json, route } from "@/lib/server/http";
import { nexconnArea, transport } from "@/lib/server/nexconn";

export const runtime = "nodejs";

// Public: exposes the App Key only, never the secret.
// No AI probe here: every chat page waits on this route before it can connect (AI state is on /api/health).
export const GET = route(async () => {
  const res: Api["GET /api/config"]["res"] = {
    transport: transport(),
    nexconn_app_key: process.env.NEXCONN_APP_KEY ?? null,
    nexconn_area: nexconnArea(),
  };
  return json(res);
});
