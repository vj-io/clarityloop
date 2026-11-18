// Service-role Supabase client. Server only: never import from a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export function db(): SupabaseClient {
  return (client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** Throw on a PostgREST error, return data otherwise (still null for an empty maybeSingle: cast to `X | null`). */
export function ok<T>(r: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(`db: ${r.error.code ?? ""} ${r.error.message}`);
  return r.data as NonNullable<T>;
}

/** Timings and error codes for /api/health. Never throws. */
export async function logHealth(kind: string, okFlag: boolean, code: string | null, ms: number | null) {
  try { await db().from("health_events").insert({ kind, ok: okFlag, code, ms }); } catch { /* best effort */ }
}

export async function audit(task_id: string | null, actor_id: string | null, type: string, payload: Record<string, unknown> = {}) {
  ok(await db().from("audit_events").insert({ task_id, actor_id, type, payload }));
}

/** True when this profile has gone over `max` calls a minute in `bucket` (counted in the database, so it holds across instances). */
export async function overLimit(profileId: string, bucket: string, max: number) {
  const { data, error } = await db().rpc("rate_add", { p_profile: profileId, p_bucket: bucket, p_window_seconds: 60, p_n: 1 });
  if (error) throw new Error(`db: ${error.message}`);
  return (data as number) > max;
}

export const nexconnId = (uuid: string) => uuid.replace(/-/g, "");
