// Judge sandbox (FR-19). Eight identical demo rooms, each with its own crew "Demo Site" and three
// seeded accounts: Ravi (supervisor, English), Murugan (worker, Hindi), Lakshmi (worker, Tamil).
// A visitor is handed the room that has been idle longest, reset to a clean state, so judges do not
// walk into each other's chats. Room 0 keeps the original fixed ids (links and recordings made
// before rooms existed still work).
import { randomBytes } from "node:crypto";
import { createAuthUser, type ProfileRow } from "./auth.ts";
import { ensureConversation, ensureCrewConversation, type ConvRow } from "./conversations.ts";
import { seedLists } from "./crew.ts";
import { db, nexconnId, ok } from "./db.ts";
import { seedSampleHistory } from "./sample-history.ts";

export const ROOMS = 8;

// ponytail: in-memory per-instance IP limit; move to rate_hit() if judges get abused across instances.
const hits = new Map<string, { at: number; n: number }>();
export function judgeLimited(req: Request, bucket = "judge", max = 30) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${bucket}:${ip}`, now = Date.now(), h = hits.get(key);
  if (!h || now - h.at > 60_000) { hits.set(key, { at: now, n: 1 }); return false; }
  return ++h.n > max;
}

const fixed = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;
const two = (i: number) => String(i).padStart(2, "0");

const crewId = (r: number) => fixed(`c${r}01`);                        // room 0: ...c001
const userId = (r: number, n: 1 | 2 | 3) => fixed(`a${r}0${n}`);       // room 0: ...a001..a003
const listId = (r: number) => (kind: "place" | "action", i: number) =>
  fixed(`b${kind === "place" ? 1 : 2}${two(i)}${r === 0 ? "" : `0${r}`}`); // room 0: ...b100, ...b200
const SEEDS = [
  { n: 1, key: "ravi", display_name: "Ravi", role: "supervisor", language: "en" },
  { n: 2, key: "murugan", display_name: "Murugan", role: "worker", language: "hi" },
  { n: 3, key: "lakshmi", display_name: "Lakshmi", role: "worker", language: "ta" },
] as const;
const email = (r: number, key: string) => `judge-${key}${r === 0 ? "" : `-r${r}`}@judge.clarityloop.app`;

export type Room = {
  room: number; ravi: ProfileRow; murugan: ProfileRow; lakshmi: ProfileRow;
  withMurugan: ConvRow; withLakshmi: ConvRow; crew: ConvRow;
};

async function ensureUser(r: number, s: (typeof SEEDS)[number]): Promise<ProfileRow> {
  const id = userId(r, s.n);
  const found = await db().auth.admin.getUserById(id);
  if (!found.data.user) {
    try { await createAuthUser(email(r, s.key), id); } catch (e) { if (!(await db().auth.admin.getUserById(id)).data.user) throw e; }
  }
  ok(await db().from("profiles").upsert({
    id, display_name: s.display_name, role: s.role, language: s.language, crew_id: crewId(r),
    nexconn_user_id: nexconnId(id), is_sandbox: true,
  }, { ignoreDuplicates: true }));
  return ok(await db().from("profiles").select("*").eq("id", id).single()) as ProfileRow;
}

/** The room's accounts and chats, created if missing. Fast when everything already exists. */
export async function ensureRoom(r: number): Promise<Room> {
  const cid = crewId(r);
  const [p, c] = await Promise.all([
    db().from("profiles").select("*").in("id", [userId(r, 1), userId(r, 2), userId(r, 3)]),
    db().from("conversations").select("*").eq("crew_id", cid),
  ]);
  const profiles = ok(p) as ProfileRow[], convs = ok(c) as ConvRow[];
  const by = (n: 1 | 2 | 3) => profiles.find((x) => x.id === userId(r, n));
  const pair = (n: 2 | 3) => convs.find((x) => x.kind === "pair" && x.worker_id === userId(r, n));
  const crewConv = convs.find((x) => x.kind === "crew");
  if (by(1) && by(2) && by(3) && pair(2) && pair(3) && crewConv) {
    return { room: r, ravi: by(1)!, murugan: by(2)!, lakshmi: by(3)!, withMurugan: pair(2)!, withLakshmi: pair(3)!, crew: crewConv };
  }
  ok(await db().from("crews").upsert({
    id: cid, name: "Demo Site", site_name: "Demo Site", join_code: r === 0 ? "DEMO26" : `DEMOR${r}`, supervisor_id: userId(r, 1), is_sandbox: true,
  }, { ignoreDuplicates: true }));
  await seedLists(cid, listId(r));
  const [ravi, murugan, lakshmi] = await Promise.all(SEEDS.map((s) => ensureUser(r, s)));
  const [withMurugan, withLakshmi, crew] = await Promise.all([ensureConversation(ravi, murugan), ensureConversation(ravi, lakshmi), ensureCrewConversation(cid)]);
  return { room: r, ravi, murugan, lakshmi, withMurugan, withLakshmi, crew };
}

/**
 * Back to a clean room: no tasks, crew tasks, cards or messages; visitors who joined with the public
 * demo code are removed; on Nexconn every chat moves to a new, empty group; sample history is put back.
 */
export async function resetRoom(r: number): Promise<Room> {
  const room = await ensureRoom(r);
  const cid = crewId(r);
  // a visitor may have switched a demo account's language (or, before renames were blocked, its name)
  await Promise.all(SEEDS.map((s) => db().from("profiles").update({ display_name: s.display_name, language: s.language }).eq("id", userId(r, s.n))));
  for (const s of SEEDS) Object.assign(room[s.key], { display_name: s.display_name, language: s.language });
  const convs = [room.withMurugan, room.withLakshmi, room.crew];
  const ids = convs.map((c) => c.id);
  const visitors = ok(await db().from("profiles").select("id").eq("crew_id", cid)
    .not("id", "in", `(${[1, 2, 3].map((n) => userId(r, n as 1 | 2 | 3)).join(",")})`)) as { id: string }[];
  if (visitors.length) ok(await db().from("tasks").delete().in("worker_id", visitors.map((v) => v.id)).select("id"));
  await Promise.all(visitors.map((v) => db().auth.admin.deleteUser(v.id))); // profile and pair chat cascade
  await Promise.all([
    db().from("tasks").delete().in("conversation_id", ids),
    db().from("broadcasts").delete().eq("crew_id", cid),
    db().from("briefings").delete().eq("crew_id", cid),   // replies cascade
    db().from("card_outbox").delete().in("conversation_id", ids),
    db().from("local_messages").delete().in("conversation_id", ids),
    db().from("message_translations").delete().in("conversation_id", ids),
  ]);
  await Promise.all(convs.map(async (c) => ok(await db().from("conversations").update({
    nexconn_group_id: (c.kind === "crew" ? "k" : "c") + randomBytes(16).toString("hex"), last_activity_at: new Date().toISOString(),
  }).eq("id", c.id).select("id"))));
  // Create the new Nexconn groups now, so the three windows a judge opens next all take the fast path.
  const [withMurugan, withLakshmi, crew] = await Promise.all([
    ensureConversation(room.ravi, room.murugan), ensureConversation(room.ravi, room.lakshmi), ensureCrewConversation(cid),
  ]);
  // one seeded site word (kept across resets; a duplicate insert is refused by the unique index and ignored)
  await db().from("crew_terms").insert({
    crew_id: cid, term: "steel rods", meaning_en: "steel rods", meaning_hi: "सरिया", meaning_ta: "இரும்புக் கம்பிகள்",
    meanings_beta: { bn: "লোহার রড", te: "ఇనుప కడ్డీలు", mr: "लोखंडी सळया" }, created_by: room.ravi.id,
  });
  const fresh = { ...room, withMurugan, withLakshmi, crew };
  await seedSampleHistory({
    supervisorId: room.ravi.id,
    workers: { murugan: { id: room.murugan.id, conversationId: withMurugan.id }, lakshmi: { id: room.lakshmi.id, conversationId: withLakshmi.id } },
    placeId: (i) => listId(r)("place", i), actionId: (i) => listId(r)("action", i),
  }).catch((e) => console.error("[sample history]", e)); // never block a judge on sample data
  return fresh;
}

/** Latest activity in a room's chats (0 if the room does not exist yet). */
async function lastActive(r: number): Promise<number> {
  const [c, k] = await Promise.all([
    db().from("conversations").select("last_activity_at").eq("crew_id", crewId(r)),
    db().from("crews").select("touched_at").eq("id", crewId(r)).maybeSingle(),
  ]);
  const rows = ok(c) as { last_activity_at: string }[];
  const touched = (k.data as { touched_at: string | null } | null)?.touched_at;
  return Math.max(0, touched ? Date.parse(touched) : 0, ...rows.map((x) => Date.parse(x.last_activity_at)));
}

/** Mark a room as in use (each window a judge opens calls this). */
export async function touchRoom(room: Room) {
  await touchSandboxCrew(room.ravi.crew_id!);
}

/** Someone in this sandbox crew is active (called on sign-in, connect and inbox polls; at most one write a minute). */
export async function touchSandboxCrew(crew: string) {
  const now = Date.now();
  await db().from("crews").update({ touched_at: new Date(now).toISOString() }).eq("id", crew).eq("is_sandbox", true)
    .or(`touched_at.is.null,touched_at.lt.${new Date(now - 60_000).toISOString()}`);
}

/** Hand out the room that has been idle longest (rooms 1..7; room 0 stays for old links), reset to clean. */
export async function pickRoom(): Promise<number> {
  const rs = Array.from({ length: ROOMS - 1 }, (_, i) => i + 1);
  const idle = await Promise.all(rs.map(async (r) => ({ r, at: await lastActive(r) })));
  idle.sort((a, b) => a.at - b.at || a.r - b.r);
  // Oldest activity first, so a room in use is only taken when all seven are busy. The claim is one atomic
  // update: two visitors arriving together cannot both take (and both re-seed) the same room.
  const now = Date.now();
  for (const { r } of idle) {
    const got = ok(await db().from("crews").update({ touched_at: new Date(now).toISOString() }).eq("id", crewId(r))
      .or(`touched_at.is.null,touched_at.lt.${new Date(now - 10_000).toISOString()}`).select("id")) as unknown[];
    if (got.length) { await resetRoom(r); return r; }
  }
  const r = idle[0].r; // every room claimed in the last 10 s (or none exists yet)
  await resetRoom(r);
  return r;
}
