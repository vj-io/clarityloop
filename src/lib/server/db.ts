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

export const nexconnId = (uuid: string) => uuid.replace(/-/g, "");
