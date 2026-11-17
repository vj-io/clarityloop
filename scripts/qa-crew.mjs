// One reusable QA crew for live tests (never throwaway users: every new account that opens a chat
// registers a Nexconn user, and the free plan caps them). Idempotent: creates what is missing, then
// prints fresh session grants as JSON.
// Run: node --env-file=.env.local scripts/qa-crew.mjs [base_url]   (default http://localhost:3000)
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://localhost:3000";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
const SUP_EMAIL = "qa-sup@test.clarityloop.app";
const WORKERS = [["QA Murugan", "hi"], ["QA Lakshmi", "ta"], ["QA Imran", "hi"]];
const PIN = "4321";

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Same exchange as grantFor() in src/lib/server/auth.ts: a magic link the server redeems itself. */
async function sessionFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink: ${error.message}`);
  const v = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (!v.data.session) throw new Error(`verifyOtp: ${v.error?.message}`);
  return v.data.session;
}

// supervisor: auth user (admin API, as createAuthUser does) + profile and crew via POST /api/crews
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (!list.users.some((u) => u.email === SUP_EMAIL)) {
  const { error } = await admin.auth.admin.createUser({ email: SUP_EMAIL, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
}
const sup = await sessionFor(SUP_EMAIL);
let me = (await call("GET", "/api/me", null, sup.access_token)).json.me;
if (!me) {
  const r = await call("POST", "/api/crews", { display_name: "QA Ravi", language: "en", crew_name: "QA Crew", site_name: "QA Site" }, sup.access_token);
  if (r.status !== 200) throw new Error(`POST /api/crews ${r.status} ${JSON.stringify(r.json)}`);
  me = r.json.me;
}
const crew = (await call("GET", "/api/crew", null, sup.access_token)).json.crew;

// workers: join once, sign in with the PIN afterwards
const workers = {};
for (const [name, language] of WORKERS) {
  let r = await call("POST", "/api/worker-login", { join_code: crew.join_code, name, pin: PIN });
  if (r.status === 401) r = await call("POST", "/api/join", { join_code: crew.join_code, name, language, pin: PIN });
  if (r.status !== 200) throw new Error(`${name}: ${r.status} ${JSON.stringify(r.json)}`);
  // a full session object (what the browser stores under cl_auth), not only the access token
  const { data } = await anon.auth.setSession({ access_token: r.json.access_token, refresh_token: r.json.refresh_token });
  workers[name] = data.session;
}

console.log(JSON.stringify({ crew: { id: crew.id, join_code: crew.join_code, name: crew.name }, supervisor: sup, workers }));
