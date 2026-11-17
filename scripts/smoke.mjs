// End-to-end smoke test against a running dev server and the real Supabase project.
// Run:  npx next dev -p 3101   (in another terminal), then
//       node --env-file=.env.local scripts/smoke.mjs [base_url]
// Uses judge mode (sandbox data) and cleans up the task, messages and the extra worker it creates.
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://localhost:3101";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const started = new Date().toISOString();
let failed = 0;
const SMOKE_IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`;

function check(name, cond, detail = "") {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  return cond;
}
async function call(method, path, body, token) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Forwarded-For": SMOKE_IP, // own bucket for the in-memory judge limit, apart from other local testers
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: Date.now() - t0 };
}
async function session(grant) {
  if (!grant.access_token) throw new Error("grant has no access_token");
  return grant.access_token;
}

let taskId, convId, extraWorkerId;
try {
  const cfg = await call("GET", "/api/config");
  check("GET /api/config", cfg.status === 200 && cfg.json.transport, JSON.stringify(cfg.json));

  // --- judge sessions ---
  const gs = await call("POST", "/api/judge", { role: "supervisor" });
  const gw = await call("POST", "/api/judge", { role: "worker" });
  check("judge grants for both roles", gs.status === 200 && gw.status === 200 && gs.json.access_token && gw.json.conversation_id === gs.json.conversation_id, `${gs.status}/${gw.status} ${gs.ms}ms`);
  convId = gs.json.conversation_id;
  // A newer grant for the same account invalidates an older one, so a judge tab opened elsewhere
  // at the same moment (e.g. another tester) can void ours: retry once with a fresh grant.
  const judgeSession = async (role, grant) => {
    try { return await session(grant); } catch (e) {
      console.log(`note  ${role} grant was superseded (${e.message}); retrying once`);
      return session((await call("POST", "/api/judge", { role })).json);
    }
  };
  const sup = await judgeSession("supervisor", gs.json), wrk = await judgeSession("worker", gw.json);
  check("both grants carry a session", Boolean(sup && wrk));

  const meS = await call("GET", "/api/me", null, sup), meW = await call("GET", "/api/me", null, wrk);
  check("GET /api/me (Ravi, supervisor, en)", meS.json.me?.display_name === "Ravi" && meS.json.me.role === "supervisor" && meS.json.me.language === "en");
  check("GET /api/me (Murugan, worker, hi)", meW.json.me?.display_name === "Murugan" && meW.json.me.role === "worker" && meW.json.me.language === "hi");
  check("GET /api/me without token => 401", (await call("GET", "/api/me")).status === 401);

  const convS = await call("GET", "/api/conversations", null, sup);
  check("GET /api/conversations lists the pair", convS.json.conversations?.some((c) => c.id === convId && c.other.display_name === "Murugan"));
  const convOne = await call("GET", `/api/conversations/${convId}`, null, wrk);
  check("GET /api/conversations/:id members keyed by nexconn id", Boolean(convOne.json.members?.[meS.json.me.nexconn_user_id]?.display_name === "Ravi"));
  const tok = await call("POST", "/api/nexconn/token", null, wrk);
  check("POST /api/nexconn/token returns own id", tok.status === 200 && tok.json.user_id === meW.json.me.nexconn_user_id, JSON.stringify(tok.json));

  // --- local chat ---
  const local = cfg.json.transport === "local";
  if (local) {
    const sent = await call("POST", "/api/local/messages", { conversation_id: convId, text: "Theek hai sir, kahan utaarna hai?" }, wrk);
    check("worker sends a local message", sent.status === 200 && sent.json.message?.from === meW.json.me.nexconn_user_id);
    const fake = await call("POST", "/api/local/messages", { conversation_id: convId, text: "[[CL:TASK]]00000000-0000-0000-0000-000000000000" }, wrk);
    check("card-looking user text is stored as the user's message, not the bot's", fake.status === 200 && fake.json.message.from === meW.json.me.nexconn_user_id && fake.json.message.from !== "clarityloopbot");
    const list = await call("GET", `/api/local/messages?conversation_id=${convId}&after=${sent.json.message.at - 1}`, null, sup);
    check("supervisor lists the message", list.json.messages?.some((m) => m.id === sent.json.message.id));
    const after = await call("GET", `/api/local/messages?conversation_id=${convId}&after=${fake.json.message.at}`, null, sup);
    check("`after` is exclusive", !after.json.messages?.some((m) => m.id === fake.json.message.id));

    // --- translation ---
    const tr = await call("POST", "/api/translate", { conversation_id: convId, messages: [
      { id: sent.json.message.id, text: sent.json.message.text },
      { id: "smoke-quick-" + Date.now(), text: "theek hai" },
      { id: fake.json.message.id, text: fake.json.message.text },
    ] }, sup);
    const [t1, t2, t3] = tr.json.translations ?? [];
    check("translate: sentence => real translation, or a clean AI-unavailable error", tr.status === 200 && (t1?.text ? t1.source_lang === "hi" : t1?.error === true), JSON.stringify(t1) + ` ${tr.ms}ms`);
    check("translate: 'theek hai' answered from the word list", t2?.text === "OK" && t2.source_lang === "hi", JSON.stringify(t2));
    check("translate: card text is never translated", t3?.text === null && !t3.error);
    const tr2 = await call("POST", "/api/translate", { conversation_id: convId, messages: [{ id: t2 ? tr.json.translations[1].id : "x", text: "theek hai" }] }, sup);
    check("translate: second request served from cache", tr2.json.translations?.[0]?.text === "OK", `${tr2.ms}ms`);
  }

  // --- task flow ---
  const crew = (await call("GET", "/api/crew", null, sup)).json.crew;
  const A = (en) => crew.actions.find((a) => a.labels.en === en).id, P = (en) => crew.places.find((p) => p.labels.en === en).id;
  check("GET /api/crew has the seeded lists", crew.places.length >= 5 && crew.actions.length >= 5 && crew.join_code === "DEMO26");
  const taskBody = { conversation_id: convId, action_id: A("Unload"), object_text: "cement bags", place_id: P("Gate 3"), due_time: "14:00", quantity: 40, unit: "bags" };
  check("worker cannot create a task (403)", (await call("POST", "/api/tasks", taskBody, wrk)).status === 403);
  const bad = await call("POST", "/api/tasks", { ...taskBody, due_time: "2pm" }, sup);
  check("invalid due_time => 400 invalid", bad.status === 400 && bad.json.error === "invalid");
  const created = await call("POST", "/api/tasks", taskBody, sup);
  taskId = created.json.task?.id;
  check("supervisor creates the task (waiting)", created.status === 200 && created.json.task.state === "waiting", `${created.ms}ms`);
  const wView = await call("GET", `/api/tasks/${taskId}`, null, wrk);
  check("worker sees the task in Hindi labels", wView.json.task?.place === "गेट 3" && wView.json.task.action === "उतारना", `${wView.json.task?.action} · ${wView.json.task?.object} · ${wView.json.task?.place}`);
  check("confirm while waiting => 409 blocked", (await call("POST", `/api/tasks/${taskId}/confirm`, null, wrk)).json.error === "blocked");
  check("supervisor cannot restate (403)", (await call("POST", `/api/tasks/${taskId}/restate`, { text: "x" }, sup)).status === 403);

  const r1 = await call("POST", `/api/tasks/${taskId}/restate`, { text: "40 bori cement Gate 2 pe utaarna hai, 2 baje tak." }, wrk);
  const c1 = r1.json.check;
  check("restate => check exists", r1.status === 200 && Boolean(c1?.id), `state=${r1.json.task?.state} overall=${c1?.overall} unreadable=${c1?.unreadable} ${r1.ms}ms`);
  if (c1?.unreadable) check("AI down => amber 'couldn't check' (needs_look, all unclear)", c1.overall === "needs_look" && c1.rows.every((r) => r.mark === "unclear" || r.supervisor === ""));
  else check("AI up => demo case: place mismatch only", c1?.overall === "mismatch" && c1.rows.find((r) => r.field === "place").mark === "mismatch", JSON.stringify(c1?.rows?.map((r) => `${r.field}:${r.mark}`)));
  check("check rows in reader's language (worker sees गेट 3)", c1?.rows?.find((r) => r.field === "place").supervisor === "गेट 3");
  check("worker cannot accept a field (403)", (await call("POST", `/api/tasks/${taskId}/accept-field`, { field: "place" }, wrk)).status === 403);
  check("confirm while not all_match => 409 blocked", (await call("POST", `/api/tasks/${taskId}/confirm`, null, sup)).json.error === "blocked");

  let state = r1.json.task.state;
  if (state === "mismatch") {
    const r2 = await call("POST", `/api/tasks/${taskId}/restate`, { text: "Gate 3 pe 40 bori cement utaarna hai, dopahar 2 baje tak." }, wrk);
    state = r2.json.task?.state;
    check("re-restate with Gate 3 => new check", r2.status === 200 && r2.json.check.id !== c1.id, `state=${state} ${r2.ms}ms`);
  }
  let latest = (await call("GET", `/api/tasks/${taskId}`, null, sup)).json.task.latest_check;
  check("supervisor reads the check in English", latest.rows.find((r) => r.field === "place").supervisor === "Gate 3", `restatement.translated=${JSON.stringify(latest.restatement.translated)}`);
  check("cannot accept a field that is not unclear", latest.rows.some((r) => r.mark !== "unclear")
    ? (await call("POST", `/api/tasks/${taskId}/accept-field`, { field: latest.rows.find((r) => r.mark !== "unclear").field }, sup)).status === 409 : true);
  for (const row of latest.rows.filter((r) => r.mark === "unclear" && !r.accepted)) {
    const a = await call("POST", `/api/tasks/${taskId}/accept-field`, { field: row.field }, sup);
    check(`supervisor accepts unclear field '${row.field}'`, a.status === 200, `state=${a.json.task?.state}`);
    state = a.json.task?.state;
  }
  check("task is all_match", state === "all_match", state);
  const cw = await call("POST", `/api/tasks/${taskId}/confirm`, null, wrk);
  check("worker confirms (still all_match, 1 confirmation)", cw.json.task?.state === "all_match" && cw.json.task.confirmations.length === 1);
  const cs = await call("POST", `/api/tasks/${taskId}/confirm`, null, sup);
  check("supervisor confirms => understood", cs.json.task?.state === "understood" && cs.json.task.understood_at);
  check("confirm again is idempotent", (await call("POST", `/api/tasks/${taskId}/confirm`, null, wrk)).json.task?.state === "understood");
  check("restate after understood => 409", (await call("POST", `/api/tasks/${taskId}/restate`, { text: "x" }, wrk)).status === 409);
  check("worker cannot mark done (403)", (await call("POST", `/api/tasks/${taskId}/done`, null, wrk)).status === 403);
  const dn = await call("POST", `/api/tasks/${taskId}/done`, null, sup);
  check("supervisor marks done", dn.json.task?.state === "done" && dn.json.task.done_at);
  const tl = await call("GET", "/api/tasks", null, sup);
  check("GET /api/tasks lists it as done", tl.json.tasks?.find((t) => t.id === taskId)?.state === "done");
  const ck = await call("GET", `/api/checks/${latest.id}`, null, wrk);
  check("GET /api/checks/:id", ck.status === 200 && ck.json.check.id === latest.id && ck.json.task.id === taskId);
  const audits = (await admin.from("audit_events").select("type").eq("task_id", taskId)).data ?? [];
  check("every state change audited", ["task_created", "restated", "checked", "confirmed", "done"].every((t) => audits.some((a) => a.type === t)), audits.map((a) => a.type).join(","));

  if (local) {
    const msgs = (await call("GET", `/api/local/messages?conversation_id=${convId}&after=${Date.parse(started) - 1}`, null, wrk)).json.messages ?? [];
    const cards = msgs.filter((m) => m.from === "clarityloopbot").map((m) => m.text.replace(/[0-9a-f-]{36}/g, "<id>"));
    check("cards posted by the bot in order", cards[0] === "[[CL:TASK]]<id>" && cards.includes("[[CL:CHECK]]<id>") && cards.at(-1) === "[[CL:STATE]]<id>:done", cards.join(" | "));
  }
  const pend = (await admin.from("card_outbox").select("id", { count: "exact", head: true }).eq("conversation_id", convId).is("sent_at", null)).count;
  check("card outbox fully sent", pend === 0, `pending=${pend}`);

  // --- non-member + PIN lock ---
  const name = "Smoke" + Date.now().toString(36);
  const join = await call("POST", "/api/join", { join_code: "demo26", name, language: "ta", pin: "4321" });
  check("POST /api/join creates a worker", join.status === 200 && join.json.access_token);
  check("same name again => 409", (await call("POST", "/api/join", { join_code: "DEMO26", name: name.toUpperCase(), language: "ta", pin: "1111" })).status === 409);
  const other = await session(join.json);
  extraWorkerId = (await call("GET", "/api/me", null, other)).json.me.id;
  check("non-member: GET task => 404", (await call("GET", `/api/tasks/${taskId}`, null, other)).status === 404);
  check("non-member: GET conversation => 404", (await call("GET", `/api/conversations/${convId}`, null, other)).status === 404);
  check("non-member: translate => 404", (await call("POST", "/api/translate", { conversation_id: convId, messages: [{ id: "x", text: "hello" }] }, other)).status === 404);
  if (local) check("non-member: local messages => 404", (await call("GET", `/api/local/messages?conversation_id=${convId}`, null, other)).status === 404);
  const good = await call("POST", "/api/worker-login", { join_code: "DEMO26", name: name.toLowerCase(), pin: "4321" });
  check("worker-login with the right PIN (case-insensitive name)", good.status === 200 && good.json.access_token);
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call("POST", "/api/worker-login", { join_code: "DEMO26", name, pin: "0000" })).status);
  check("5 wrong PINs => 401 x4 then 423", codes.join(",") === "401,401,401,401,423", codes.join(","));
  const locked = await call("POST", "/api/worker-login", { join_code: "DEMO26", name, pin: "4321" });
  check("right PIN while locked => 423 locked", locked.status === 423 && locked.json.error === "locked");

  const h = await call("GET", "/api/health");
  check("GET /api/health", h.status === 200 && h.json.db_ok === true, JSON.stringify({ ai_ready: h.json.ai_ready, pending: h.json.pending_cards, timings: h.json.timings }));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error —", e);
} finally {
  // Clean the sandbox: the task, messages and cards created by this run, and the extra worker.
  if (taskId) await admin.from("tasks").delete().eq("id", taskId);
  if (convId) {
    await admin.from("local_messages").delete().eq("conversation_id", convId).gte("created_at", started);
    await admin.from("card_outbox").delete().eq("conversation_id", convId).gte("created_at", started);
    await admin.from("message_translations").delete().eq("conversation_id", convId).gte("created_at", started);
  }
  if (extraWorkerId) await admin.auth.admin.deleteUser(extraWorkerId);
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
}
