import { z } from "zod";
import { LangSchema } from "@/lib/types";
import { requireMe, requireUser, toMe, type ProfileRow } from "@/lib/server/auth";
import { db, ok } from "@/lib/server/db";
import { body, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const { profile } = await requireUser(req);
  return json({ me: profile ? toMe(profile) : null });
});

const Patch = z.object({ language: LangSchema.optional(), display_name: z.string().trim().min(1).max(40).optional() });

export const PATCH = route(async (req) => {
  const me = await requireMe(req);
  const b = await body(req, Patch);
  const p = ok(await db().from("profiles").update(b).eq("id", me.id).select("*").single()) as ProfileRow;
  return json({ me: toMe(p) });
});
