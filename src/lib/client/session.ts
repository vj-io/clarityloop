// Browser session + API helper. Routes authenticate with a Bearer token, not cookies,
// so two judge tabs can hold two different users in one browser.
"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { Api, Me, SessionGrant } from "@/lib/types";

const JUDGE_FLAG = "cl_judge_tab";
/** Judge tabs keep their session in sessionStorage (per tab); everyone else in localStorage. */
export const isJudgeTab = () => typeof window !== "undefined" && sessionStorage.getItem(JUDGE_FLAG) === "1";
export const markJudgeTab = () => sessionStorage.setItem(JUDGE_FLAG, "1");

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (client) return client;
  client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      storage: isJudgeTab() ? window.sessionStorage : window.localStorage,
      storageKey: "cl_auth",
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    },
  });
  return client;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

type Key = keyof Api;
type Res<K extends Key> = Api[K] extends { res: infer R } ? R : never;
type Req<K extends Key> = Api[K] extends { req: infer R } ? R : undefined;

/** api("POST /api/tasks/:id/confirm", undefined, { id }) — path params are filled from `params`. */
export async function api<K extends Key>(key: K, body?: Req<K>, params?: Record<string, string | number>): Promise<Res<K>> {
  const [method, rawPath] = (key as string).split(" ");
  let path = rawPath.split("?")[0];
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (path.includes(`:${k}`)) path = path.replace(`:${k}`, encodeURIComponent(String(v)));
    else query.set(k, String(v));
  }
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path + (query.size ? `?${query}` : ""), {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? "error", json.message);
  return json as Res<K>;
}

/** Turn a server-issued grant (join, worker login, judge) into a browser session. */
export async function adoptGrant(g: SessionGrant) {
  const { error } = await supabase().auth.verifyOtp({ token_hash: g.token_hash, type: "magiclink" });
  if (error) throw new ApiError(401, "unauthorized", error.message);
}

export async function signOut() { await supabase().auth.signOut(); }

/** undefined = loading · null = signed out, or signed in without a profile (see `needsOnboarding`). */
export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [needsOnboarding, setNeeds] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) { if (live) { setMe(null); setNeeds(false); } return; }
      try {
        const r = await api("GET /api/me");
        if (live) { setMe(r.me); setNeeds(r.me === null); }
      } catch { if (live) setMe(null); }
    })();
    return () => { live = false; };
  }, [tick]);
  return { me, needsOnboarding, refresh: () => setTick((t) => t + 1) };
}
