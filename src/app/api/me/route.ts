import { z } from "zod";
import { LangSchema } from "@/lib/types";
import { requireMe, requireUser, toMe, type ProfileRow } from "@/lib/server/auth";
import { db, ok } from "@/lib/server/db";
import { body, fail, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const { profile } = await requireUser(req);
  return json({ me: profile ? toMe(profile) : null });
});

const Patch = z.object({ language: LangSchema.optional(), display_name: z.string().trim().min(1).max(40).optional() });

export const PATCH = route(async (req) => {
  const me = await requireMe(req);
  const b = await body(req, Patch);
  if (b.display_name && b.display_name !== me.display_name) {
    if (me.is_sandbox) return fail(403, "forbidden", "demo accounts keep their names");
    const taken = ok(await db().from("profiles").select("id").eq("crew_id", me.crew_id).neq("id", me.id)
      .ilike("display_name", b.display_name.replace(/[\\%_]/g, "\\$&")).limit(1)) as unknown[];
    if (taken.length) return fail(409, "conflict", "name already used in this crew");
  }
  const p = ok(await db().from("profiles").update(b).eq("id", me.id).select("*").single()) as ProfileRow;
  return json({ me: toMe(p) });
});
