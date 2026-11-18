import { z } from "zod";
import { isBeta, LangSchema } from "@/lib/types";
import { createAuthUser, grantFor, workerEmail, type ProfileRow } from "@/lib/server/auth";
import { ensureConversation, ensureCrewConversation } from "@/lib/server/conversations";
import { ensureBetaLabels } from "@/lib/server/crew";
import { db, nexconnId, ok } from "@/lib/server/db";
import { body, fail, json, route } from "@/lib/server/http";
import { hashPin, PIN_RE } from "@/lib/server/pin";
import { judgeLimited } from "@/lib/server/sandbox";

export const runtime = "nodejs";

const Body = z.object({
  join_code: z.string().trim().min(4).max(12),
  name: z.string().trim().min(1).max(40),
  language: LangSchema,
  pin: z.string().regex(PIN_RE),
});

/** FR-2: a worker joins with crew code, name, language and a 4-digit PIN. No email needed. */
export const POST = route(async (req) => {
  if (judgeLimited(req, "join", 6)) return fail(429, "rate_limited");
  const b = await body(req, Body);
  const crew = ok(await db().from("crews").select("id, supervisor_id").eq("join_code", b.join_code.toUpperCase()).maybeSingle()) as { id: string; supervisor_id: string } | null;
  if (!crew) return fail(404, "not_found", "unknown crew code");
  const taken = ok(await db().from("profiles").select("id").eq("crew_id", crew.id).ilike("display_name", b.name.replace(/[\\%_]/g, "\\$&")).limit(1));
  if (taken.length) return fail(409, "conflict", "name already used in this crew");

  const id = await createAuthUser(workerEmail());
  const worker = ok(await db().from("profiles").insert({
    id, display_name: b.name, role: "worker", language: b.language, crew_id: crew.id,
    nexconn_user_id: nexconnId(id), pin_hash: hashPin(b.pin),
  }).select("*").single()) as ProfileRow;

  if (isBeta(b.language)) await ensureBetaLabels(crew.id).catch((e) => console.error("[join] beta labels", e));
  // Open the pair conversation now so the worker's inbox is not empty.
  const sup = ok(await db().from("profiles").select("*").eq("id", crew.supervisor_id).maybeSingle()) as ProfileRow | null;
  if (sup) await ensureConversation(sup, worker).catch((e) => console.error("[join] conversation", e));
  await ensureCrewConversation(crew.id).catch((e) => console.error("[join] crew channel", e)); // adds the joiner to the crew channel

  return json(await grantFor(id));
});
