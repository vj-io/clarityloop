import { requireMe } from "@/lib/server/auth";
import { fail, json, route } from "@/lib/server/http";
import { issueToken, transport } from "@/lib/server/nexconn";
import { touchSandboxCrew } from "@/lib/server/sandbox";

export const runtime = "nodejs";

/** A Nexconn token for the caller's own id only. Local transport: token null. */
export const POST = route(async (req) => {
  const me = await requireMe(req);
  if (me.is_sandbox && me.crew_id) await touchSandboxCrew(me.crew_id).catch(() => {});
  if (transport() === "local") return json({ user_id: me.nexconn_user_id, token: null });
  try {
    return json({ user_id: me.nexconn_user_id, token: await issueToken(me.nexconn_user_id, me.display_name) });
  } catch {
    return fail(503, "nexconn_unavailable");
  }
});
