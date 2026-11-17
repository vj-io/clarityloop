import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createAuthUser, grantFor, type ProfileRow } from "@/lib/server/auth";
import { ensureConversation } from "@/lib/server/conversations";
import { seedLists } from "@/lib/server/crew";
import { db, nexconnId, ok } from "@/lib/server/db";
import { body, fail, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

// Fixed ids make the sandbox seed idempotent: every judge visit reuses the same two accounts.
const fixed = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const CREW_ID = fixed("c001");
const RAVI = { id: fixed("a001"), email: "judge-ravi@judge.clarityloop.app", display_name: "Ravi", role: "supervisor", language: "en" } as const;
const MURUGAN = { id: fixed("a002"), email: "judge-murugan@judge.clarityloop.app", display_name: "Murugan", role: "worker", language: "hi" } as const;

// ponytail: in-memory per-instance IP limit; move to rate_hit() if judges get abused across instances.
const hits = new Map<string, { at: number; n: number }>();
function limited(ip: string) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.at > 60_000) { hits.set(ip, { at: now, n: 1 }); return false; }
  return ++h.n > 20;
}

const STALE_MS = 20 * 60_000;
/** Drop the sandbox chat's tasks, cards and messages. On Nexconn the pair moves to a new, empty group. */
async function resetSandbox(convId: string) {
  await Promise.all([
    db().from("tasks").delete().eq("conversation_id", convId),
    db().from("card_outbox").delete().eq("conversation_id", convId),
    db().from("local_messages").delete().eq("conversation_id", convId),
    db().from("message_translations").delete().eq("conversation_id", convId),
  ]);
  ok(await db().from("conversations").update({
    nexconn_group_id: "c" + randomBytes(16).toString("hex"), last_activity_at: new Date().toISOString(),
  }).eq("id", convId).select("id"));
}

async function ensureUser(u: typeof RAVI | typeof MURUGAN): Promise<ProfileRow> {
  const found = await db().auth.admin.getUserById(u.id);
  if (!found.data.user) {
    try { await createAuthUser(u.email, u.id); } catch (e) { if (!(await db().auth.admin.getUserById(u.id)).data.user) throw e; }
  }
  ok(await db().from("profiles").upsert({
    id: u.id, display_name: u.display_name, role: u.role, language: u.language, crew_id: CREW_ID,
    nexconn_user_id: nexconnId(u.id), is_sandbox: true,
  }, { ignoreDuplicates: true }));
  return ok(await db().from("profiles").select("*").eq("id", u.id).single()) as ProfileRow;
}

/** FR-19: seeded English supervisor + Hindi worker on the sandbox crew "Demo Site". */
export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(ip)) return fail(429, "rate_limited");
  const { role, fresh } = await body(req, z.object({ role: z.enum(["supervisor", "worker"]), fresh: z.boolean().optional() }));

  ok(await db().from("crews").upsert({
    id: CREW_ID, name: "Demo Site", site_name: "Demo Site", join_code: "DEMO26", supervisor_id: RAVI.id, is_sandbox: true,
  }, { ignoreDuplicates: true }));
  await seedLists(CREW_ID, (kind, i) => fixed(`b${kind === "place" ? 1 : 2}${String(i).padStart(2, "0")}`));
  const [ravi, murugan] = await Promise.all([ensureUser(RAVI), ensureUser(MURUGAN)]);
  let conv = await ensureConversation(ravi, murugan);
  // A judge should not walk into the previous judge's chat: start clean when asked, or when idle for 20 minutes.
  if (fresh || Date.now() - Date.parse(conv.last_activity_at) > STALE_MS) {
    await resetSandbox(conv.id);
    conv = await ensureConversation(ravi, murugan);
  }

  return json({ ...(await grantFor(role === "supervisor" ? ravi.id : murugan.id)), conversation_id: conv.id });
});
