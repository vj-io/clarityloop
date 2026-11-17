// Bearer-token auth (no cookies) and server-issued sessions for workers and judges.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Lang, Me, Role, SessionGrant } from "../types.ts";
import { db, ok } from "./db.ts";
import { fail, forbidden } from "./http.ts";

export type ProfileRow = {
  id: string; display_name: string; role: Role; language: Lang; crew_id: string | null;
  nexconn_user_id: string; pin_hash: string | null; pin_fails: number; pin_locked_until: string | null;
  is_sandbox: boolean; created_at: string;
};

export const toMe = (p: ProfileRow): Me => ({
  id: p.id, display_name: p.display_name, role: p.role, language: p.language,
  crew_id: p.crew_id, nexconn_user_id: p.nexconn_user_id, is_sandbox: p.is_sandbox,
});

export async function getProfile(id: string): Promise<ProfileRow | null> {
  return ok(await db().from("profiles").select("*").eq("id", id).maybeSingle()) as ProfileRow | null;
}

/** Verify `Authorization: Bearer <supabase access token>` and load the profile (null before onboarding). */
export async function requireUser(req: Request): Promise<{ userId: string; profile: ProfileRow | null }> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return fail(401, "unauthorized");
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return fail(401, "unauthorized");
  return { userId: data.user.id, profile: await getProfile(data.user.id) };
}

/** Signed in with a profile (and, if `role` is given, that role). */
export async function requireMe(req: Request, role?: Role): Promise<ProfileRow> {
  const { profile } = await requireUser(req);
  if (!profile || (role && profile.role !== role)) return forbidden();
  return profile;
}

/** Create a confirmed auth user with no password; returns its id. */
export async function createAuthUser(email: string, id?: string): Promise<string> {
  const { data, error } = await db().auth.admin.createUser({ email, email_confirm: true, ...(id ? { id } : {}) });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

export const workerEmail = () => `w-${randomBytes(8).toString("hex")}@workers.clarityloop.app`;

/**
 * A ready session for `userId`. The server makes a one-time magic link and exchanges it itself.
 * A newer link for the same account cancels an older unused one, so two people entering the same
 * judge account at once could collide if the browser did the exchange; here the window is a few
 * milliseconds and a collision is retried.
 */
export async function grantFor(userId: string): Promise<SessionGrant> {
  const u = await db().auth.admin.getUserById(userId);
  const email = u.data.user?.email;
  if (!email) throw new Error(`grant: user ${userId} has no email`);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let last = "";
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email });
    if (error || !data.properties?.hashed_token) throw new Error(`generateLink: ${error?.message}`);
    const v = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
    if (v.data.session) return { access_token: v.data.session.access_token, refresh_token: v.data.session.refresh_token };
    last = v.error?.message ?? "no session";
  }
  throw new Error(`grant: ${last}`);
}
