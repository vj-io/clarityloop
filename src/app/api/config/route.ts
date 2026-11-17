import type { Api } from "@/lib/types";
import { aiReady } from "@/lib/server/ai";
import { json, route } from "@/lib/server/http";
import { nexconnArea, transport } from "@/lib/server/nexconn";

export const runtime = "nodejs";

// Public: exposes the App Key only, never the secret.
export const GET = route(async () => {
  const res: Api["GET /api/config"]["res"] = {
    transport: transport(),
    nexconn_app_key: process.env.NEXCONN_APP_KEY ?? null,
    nexconn_area: nexconnArea(),
    ai_ready: await aiReady(),
  };
  return json(res);
});
