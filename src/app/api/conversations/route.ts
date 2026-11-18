import { z } from "zod";
import { requireMe, type ProfileRow } from "@/lib/server/auth";
import { conversationDTO, ensureConversation, type ConvRow } from "@/lib/server/conversations";
import { db, ok } from "@/lib/server/db";
import { body, json, notFound, route } from "@/lib/server/http";
import { touchSandboxCrew } from "@/lib/server/sandbox";

export const runtime = "nodejs";

/** Supervisor: get or create the pair conversation with a worker in their crew. */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const { worker_id } = await body(req, z.object({ worker_id: z.uuid() }));
  const worker = ok(await db().from("profiles").select("*").eq("id", worker_id).maybeSingle()) as ProfileRow | null;
  if (!worker || worker.role !== "worker" || !me.crew_id || worker.crew_id !== me.crew_id) return notFound();
  const conv = await ensureConversation(me, worker);
  return json({ conversation: await conversationDTO(conv, me.id) });
});

/** My conversations: the crew channel first, then newest activity first. */
export const GET = route(async (req) => {
  const me = await requireMe(req);
  const ids = (ok(await db().from("conversation_members").select("conversation_id").eq("profile_id", me.id)) as { conversation_id: string }[]).map((r) => r.conversation_id);
  if (me.is_sandbox && me.crew_id) await touchSandboxCrew(me.crew_id).catch(() => {}); // keeps a demo room from being handed to someone else while in use
  if (!ids.length) return json({ conversations: [] });
  const convs = (ok(await db().from("conversations").select("*").in("id", ids).order("last_activity_at", { ascending: false })) as ConvRow[])
    .sort((a, b) => Number(b.kind === "crew") - Number(a.kind === "crew"));
  // ponytail: two queries per conversation; one view/RPC if inboxes grow past a few dozen.
  return json({ conversations: await Promise.all(convs.map((c) => conversationDTO(c, me.id))) });
});
