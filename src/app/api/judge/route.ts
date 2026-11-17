import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createAuthUser, grantFor, type ProfileRow } from "@/lib/server/auth";
import { ensureConversation, ensureCrewConversation, type ConvRow } from "@/lib/server/conversations";
import { seedLists } from "@/lib/server/crew";
import { db, nexconnId, ok } from "@/lib/server/db";
import { body, fail, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

// Fixed ids make the sandbox seed idempotent: every judge visit reuses the same three accounts.
const fixed = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const CREW_ID = fixed("c001");
const RAVI = { id: fixed("a001"), email: "judge-ravi@judge.clarityloop.app", display_name: "Ravi", role: "supervisor", language: "en" } as const;
const MURUGAN = { id: fixed("a002"), email: "judge-murugan@judge.clarityloop.app", display_name: "Murugan", role: "worker", language: "hi" } as const;
const LAKSHMI = { id: fixed("a003"), email: "judge-lakshmi@judge.clarityloop.app", display_name: "Lakshmi", role: "worker", language: "ta" } as const;
type Seed = typeof RAVI | typeof MURUGAN | typeof LAKSHMI;

// ponytail: in-memory per-instance IP limit; move to rate_hit() if judges get abused across instances.
const hits = new Map<string, { at: number; n: number }>();
function limited(ip: string) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.at > 60_000) { hits.set(ip, { at: now, n: 1 }); return false; }
  return ++h.n > 20;
}

const STALE_MS = 20 * 60_000;
/**
 * Drop the sandbox crew's tasks, crew tasks, cards and messages. On Nexconn every sandbox chat
 * (both pairs and the crew channel) moves to a new, empty group.
 */
async function resetSandbox(convs: ConvRow[]) {
  const ids = convs.map((c) => c.id);
  // Visitors who joined the demo crew with its public code would otherwise sit on every roll-call board.
  const visitors = ok(await db().from("profiles").select("id").eq("crew_id", CREW_ID)
    .not("id", "in", `(${[RAVI.id, MURUGAN.id, LAKSHMI.id].join(",")})`)) as { id: string }[];
  if (visitors.length) ok(await db().from("tasks").delete().in("worker_id", visitors.map((v) => v.id)).select("id"));
  await Promise.all(visitors.map((v) => db().auth.admin.deleteUser(v.id))); // profile and pair chat cascade
  await Promise.all([
    db().from("tasks").delete().in("conversation_id", ids),
    db().from("broadcasts").delete().eq("crew_id", CREW_ID),
    db().from("card_outbox").delete().in("conversation_id", ids),
    db().from("local_messages").delete().in("conversation_id", ids),
    db().from("message_translations").delete().in("conversation_id", ids),
  ]);
  await Promise.all(convs.map(async (c) => ok(await db().from("conversations").update({
    nexconn_group_id: (c.kind === "crew" ? "k" : "c") + randomBytes(16).toString("hex"), last_activity_at: new Date().toISOString(),
  }).eq("id", c.id).select("id"))));
}

async function ensureUser(u: Seed): Promise<ProfileRow> {
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

/**
 * FR-19: seeded English supervisor + Hindi worker (+ a Tamil worker for the crew channel) on the sandbox
 * crew "Demo Site". `role: "worker"` alone still means Murugan; `worker: "lakshmi"` picks the second worker.
 */
export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(ip)) return fail(429, "rate_limited");
  const { role, fresh, worker } = await body(req, z.object({
    role: z.enum(["supervisor", "worker"]), fresh: z.boolean().optional(), worker: z.enum(["murugan", "lakshmi"]).optional(),
  }));

  ok(await db().from("crews").upsert({
    id: CREW_ID, name: "Demo Site", site_name: "Demo Site", join_code: "DEMO26", supervisor_id: RAVI.id, is_sandbox: true,
  }, { ignoreDuplicates: true }));
  await seedLists(CREW_ID, (kind, i) => fixed(`b${kind === "place" ? 1 : 2}${String(i).padStart(2, "0")}`));
  // Idle time is read before this call creates anything, so a chat created now never counts as activity.
  const before = ok(await db().from("conversations").select("last_activity_at").eq("crew_id", CREW_ID)) as { last_activity_at: string }[];
  const lastActive = Math.max(0, ...before.map((c) => Date.parse(c.last_activity_at)));
  const [ravi, murugan, lakshmi] = await Promise.all([ensureUser(RAVI), ensureUser(MURUGAN), ensureUser(LAKSHMI)]);
  const ensureAll = () => Promise.all([ensureConversation(ravi, murugan), ensureConversation(ravi, lakshmi), ensureCrewConversation(CREW_ID)]);
  let convs = await ensureAll();
  // A judge should not walk into the previous judge's chat: start clean when asked, or when idle for 20 minutes.
  if (fresh || (before.length > 0 && Date.now() - lastActive > STALE_MS)) {
    await resetSandbox(convs);
    convs = await ensureAll();
  }
  const [withMurugan, withLakshmi, crewConv] = convs;
  const who = role === "supervisor" ? ravi : worker === "lakshmi" ? lakshmi : murugan;
  const conversation_id = role === "worker" && worker === "lakshmi" ? withLakshmi.id : withMurugan.id;
  return json({ ...(await grantFor(who.id)), conversation_id, crew_conversation_id: crewConv.id });
});
