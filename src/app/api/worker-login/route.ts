import { z } from "zod";
import { grantFor, type ProfileRow } from "@/lib/server/auth";
import { db, ok } from "@/lib/server/db";
import { body, fail, json, route } from "@/lib/server/http";
import { PIN_LOCK_MS, PIN_MAX_FAILS, PIN_RE, verifyPin } from "@/lib/server/pin";

export const runtime = "nodejs";

const Body = z.object({ join_code: z.string().trim().min(4).max(12), name: z.string().trim().min(1).max(40), pin: z.string().regex(PIN_RE) });

/** Worker sign-in: crew code + case-insensitive name + PIN. 5 wrong tries => locked 5 minutes. */
export const POST = route(async (req) => {
  const b = await body(req, Body);
  const crew = ok(await db().from("crews").select("id").eq("join_code", b.join_code.toUpperCase()).maybeSingle()) as { id: string } | null;
  if (!crew) return fail(401, "unauthorized");
  const p = ok(await db().from("profiles").select("*").eq("crew_id", crew.id).eq("role", "worker")
    .ilike("display_name", b.name.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle()) as ProfileRow | null;
  if (!p) return fail(401, "unauthorized");
  // One atomic step takes an attempt before the PIN is looked at, so parallel guesses cannot outrun the lock.
  const allowed = ok(await db().rpc("pin_try", { p_id: p.id, p_max: PIN_MAX_FAILS, p_lock_seconds: PIN_LOCK_MS / 1000 })) as boolean;
  if (!allowed) return fail(423, "locked");
  if (!verifyPin(b.pin, p.pin_hash)) return fail(401, "unauthorized");
  ok(await db().from("profiles").update({ pin_fails: 0, pin_locked_until: null }).eq("id", p.id));
  return json(await grantFor(p.id));
});
