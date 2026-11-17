// Pair conversations (FR-5): one per supervisor-worker pair, one Nexconn group each.
import { randomUUID } from "node:crypto";
import type { ConversationDTO, Lang, Role } from "../types.ts";
import type { ProfileRow } from "./auth.ts";
import { db, nexconnId, ok } from "./db.ts";
import { fail, notFound } from "./http.ts";
import { ensureGroup, issueToken, transport } from "./nexconn.ts";

export type ConvRow = {
  id: string; crew_id: string; kind: string; nexconn_group_id: string;
  supervisor_id: string; worker_id: string | null; created_at: string; last_activity_at: string;
};

/** The conversation, if `profileId` is a member; 404 otherwise (no existence leak). */
export async function memberConversation(convId: string, profileId: string): Promise<ConvRow> {
  if (!/^[0-9a-f-]{36}$/i.test(convId)) return notFound();
  const [c, m] = await Promise.all([
    db().from("conversations").select("*").eq("id", convId).maybeSingle(),
    db().from("conversation_members").select("profile_id").eq("conversation_id", convId).eq("profile_id", profileId).maybeSingle(),
  ]);
  const conv = ok(c) as ConvRow | null;
  if (!conv || !ok(m)) return notFound();
  return conv;
}

// Groups this server instance has already created/joined on Nexconn: saves three API calls per request.
const ensuredGroups = new Set<string>();

export async function ensureConversation(sup: ProfileRow, worker: ProfileRow): Promise<ConvRow> {
  const find = async () => ok(await db().from("conversations").select("*")
    .eq("supervisor_id", sup.id).eq("worker_id", worker.id).maybeSingle()) as ConvRow | null;
  let conv = await find();
  if (!conv) {
    const id = randomUUID();
    const r = await db().from("conversations").insert({
      id, crew_id: sup.crew_id, kind: "pair", nexconn_group_id: "c" + nexconnId(id),
      supervisor_id: sup.id, worker_id: worker.id,
    });
    if (r.error && r.error.code !== "23505") throw new Error(`db: ${r.error.message}`); // 23505: a parallel call won
    conv = (await find())!;
  }
  ok(await db().from("conversation_members").upsert(
    [{ conversation_id: conv.id, profile_id: sup.id }, { conversation_id: conv.id, profile_id: worker.id }],
    { ignoreDuplicates: true }));
  if (transport() === "nexconn" && !ensuredGroups.has(conv.nexconn_group_id)) {
    try {
      await Promise.all([issueToken(sup.nexconn_user_id, sup.display_name), issueToken(worker.nexconn_user_id, worker.display_name)]);
      await ensureGroup(conv.nexconn_group_id, `${sup.display_name} · ${worker.display_name}`, sup.nexconn_user_id,
        [sup.nexconn_user_id, worker.nexconn_user_id]);
      ensuredGroups.add(conv.nexconn_group_id);
    } catch (e) {
      return fail(503, "nexconn_unavailable", e instanceof Error ? e.message : undefined);
    }
  }
  return conv;
}

/**
 * The crew's one crew channel (kind 'crew', worker_id null), created on first use. Every profile of the
 * crew becomes a member here and in its Nexconn group, so calling it again after a worker joins adds them.
 */
export async function ensureCrewConversation(crewId: string): Promise<ConvRow> {
  const find = async () => ok(await db().from("conversations").select("*")
    .eq("crew_id", crewId).eq("kind", "crew").maybeSingle()) as ConvRow | null;
  const [found, c, ppl] = await Promise.all([
    find(),
    db().from("crews").select("name, supervisor_id").eq("id", crewId).single(),
    db().from("profiles").select("*").eq("crew_id", crewId).order("created_at"),
  ]);
  const crew = ok(c) as { name: string; supervisor_id: string };
  const people = ok(ppl) as ProfileRow[];
  let conv = found;
  if (!conv) {
    const id = randomUUID();
    const r = await db().from("conversations").insert({
      id, crew_id: crewId, kind: "crew", nexconn_group_id: "k" + nexconnId(id), supervisor_id: crew.supervisor_id, worker_id: null,
    });
    if (r.error && r.error.code !== "23505") throw new Error(`db: ${r.error.message}`); // 23505: a parallel call won
    conv = (await find())!;
  }
  ok(await db().from("conversation_members").upsert(people.map((p) => ({ conversation_id: conv.id, profile_id: p.id })), { ignoreDuplicates: true }));
  const key = `${conv.nexconn_group_id}|${people.map((p) => p.id).join(",")}`;
  if (transport() === "nexconn" && !ensuredGroups.has(key)) {
    try {
      await Promise.all(people.map((p) => issueToken(p.nexconn_user_id, p.display_name)));
      const sup = people.find((p) => p.id === crew.supervisor_id) ?? people[0];
      await ensureGroup(conv.nexconn_group_id, crew.name, sup.nexconn_user_id, people.map((p) => p.nexconn_user_id));
      ensuredGroups.add(key);
    } catch (e) {
      return fail(503, "nexconn_unavailable", e instanceof Error ? e.message : undefined);
    }
  }
  return conv;
}

type Person = { id: string; display_name: string; language: Lang; role: Role };

export async function conversationDTO(conv: ConvRow, meId: string): Promise<ConversationDTO> {
  if (conv.kind === "crew") {
    const [c, n, me] = await Promise.all([
      db().from("crews").select("name").eq("id", conv.crew_id).single(),
      db().from("conversation_members").select("profile_id", { count: "exact", head: true }).eq("conversation_id", conv.id),
      db().from("profiles").select("language").eq("id", meId).single(),
    ]);
    if (n.error) throw new Error(`db: ${n.error.message}`);
    const title = (ok(c) as { name: string }).name;
    return {
      id: conv.id, nexconn_group_id: conv.nexconn_group_id,
      // stand-in so code written for pairs cannot crash: the crew, read in my own language
      other: { id: conv.crew_id, display_name: title, language: (ok(me) as { language: Lang }).language, role: "worker" },
      open_tasks: 0, last_activity_at: conv.last_activity_at,
      kind: "crew", title, member_count: n.count ?? 0,
    };
  }
  const otherId = meId === conv.supervisor_id ? conv.worker_id! : conv.supervisor_id;
  const [p, n] = await Promise.all([
    db().from("profiles").select("id, display_name, language, role").eq("id", otherId).single(),
    db().from("tasks").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).not("state", "in", "(understood,done)"),
  ]);
  const other = ok(p) as Person;
  if (n.error) throw new Error(`db: ${n.error.message}`);
  return {
    id: conv.id, nexconn_group_id: conv.nexconn_group_id,
    other,
    open_tasks: n.count ?? 0, last_activity_at: conv.last_activity_at,
    kind: "pair",
  };
}
