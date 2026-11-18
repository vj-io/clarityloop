"use client";
// One conversation's live state: messages (deduped by id, ordered by time), translations,
// task and check data for cards, connection status. The single place where messages merge.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/session";
import { getTransport, type ChatTransport, type LinkStatus, type Receipt, type Room } from "@/lib/client/transport";
import { BOT_USER_ID, parseCard, type Api, type BriefingDTO, type BroadcastDTO, type ChatMsg, type CheckDTO, type Me, type TaskDTO, type TranslationDTO } from "@/lib/types";

type ConvRes = Api["GET /api/conversations/:id"]["res"];
export type Tr = { state: "pending" } | { state: "done"; dto: TranslationDTO } | { state: "error" | "slow" };
/** A message I sent that has no server id yet. queued: waits for the connection (kept across a reload);
 *  sending: on its way; failed: the server refused it while connected (tap to retry). */
export type Pending = { tempId: string; text: string; state: "queued" | "sending" | "failed"; at: number; mentions?: string[]; tried?: boolean };

/** A message is a card only when it parses AND the server bot sent it (PRD security rule). */
export const cardOf = (m: ChatMsg) => (m.from === BOT_USER_ID ? parseCard(m.text) : null);

const byTime = (a: ChatMsg, b: ChatMsg) => a.at - b.at || (a.id < b.id ? -1 : 1);
const outboxKey = (conversationId: string) => `cl_outbox_${conversationId}`;
const CARD_WAIT_MS = 1500;   // history waits at most this long for its cards' data before it is drawn

export function useConversation(conversationId: string, me: Me | null) {
  const [conv, setConv] = useState<ConvRes | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [kind, setKind] = useState<ChatTransport["kind"] | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [synced, setSynced] = useState(false);   // history re-read since the last (re)connect: the outbox can dedupe
  const [pending, setPending] = useState<Pending[]>([]);
  const [tasks, setTasks] = useState<Record<string, TaskDTO>>({});
  const [checks, setChecks] = useState<Record<string, CheckDTO>>({});
  const [boards, setBoards] = useState<Record<string, BroadcastDTO>>({});   // crew channel: roll-call boards by broadcast id
  const [briefings, setBriefings] = useState<Record<string, BriefingDTO>>({});   // safety briefings by id (roll call or my card)
  const [gone, setGone] = useState<Record<string, true>>({}); // card ids whose task/check no longer exists
  const [tr, setTr] = useState<Record<string, Tr>>({});
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});   // Nexconn read receipts by message id

  const transport = useRef<ChatTransport | null>(null);
  const room = useRef<Room | null>(null);
  const seenCards = useRef(new Set<string>());
  const trQueue = useRef<{ id: string; text: string }[]>([]);
  const trTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gen = useRef(0);   // bumped on a language change: answers to older requests are dropped
  const lang = me?.language;
  const myId = me?.nexconn_user_id;

  const merge = useCallback((incoming: ChatMsg[]) => {
    if (!incoming.length) return;
    setMsgs((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]));
      let changed = false;
      for (const m of incoming) if (!map.has(m.id)) { map.set(m.id, m); changed = true; }
      return changed ? [...map.values()].sort(byTime) : cur;
    });
  }, []);

  // ---- tasks and checks (always refetched: actions act on the latest state)
  const refreshTask = useCallback(async (taskId: string) => {
    const g = gen.current;
    try {
      const { task } = await api("GET /api/tasks/:id", undefined, { id: taskId });
      if (g !== gen.current) return null;
      setTasks((s) => ({ ...s, [task.id]: task }));
      if (task.latest_check) { const c = task.latest_check; setChecks((s) => ({ ...s, [c.id]: c })); }
      return task;
    } catch (e) { if (e instanceof ApiError && e.status === 404) setGone((g) => ({ ...g, [taskId]: true })); return null; }
  }, []);
  const refreshCheck = useCallback(async (checkId: string) => {
    const g = gen.current;
    try {
      const { check, task } = await api("GET /api/checks/:id", undefined, { id: checkId });
      if (g !== gen.current) return;
      setChecks((s) => ({ ...s, [check.id]: check }));
      setTasks((s) => ({ ...s, [task.id]: task }));
    } catch (e) { if (e instanceof ApiError && e.status === 404) setGone((g) => ({ ...g, [checkId]: true })); }
  }, []);
  const refreshBoard = useCallback(async (id: string) => {
    const g = gen.current;
    try {
      const { broadcast } = await api("GET /api/broadcasts/:id", undefined, { id });
      if (g !== gen.current) return;
      setBoards((s) => ({ ...s, [id]: broadcast }));
    } catch (e) { if (e instanceof ApiError && e.status === 404) setGone((g) => ({ ...g, [id]: true })); }
  }, []);
  const refreshBriefing = useCallback(async (id: string) => {
    const g = gen.current;
    try {
      const { briefing } = await api("GET /api/briefings/:id", undefined, { id });
      if (g !== gen.current) return;
      setBriefings((s) => ({ ...s, [id]: briefing }));
    } catch (e) { if (e instanceof ApiError && e.status === 404) setGone((g) => ({ ...g, [id]: true })); }
  }, []);
  const putBriefing = useCallback((b: BriefingDTO) => setBriefings((s) => ({ ...s, [b.id]: b })), []);
  /** Fetch the data of every card in `list` not fetched yet, all in parallel. Resolves when every card in `list`
   *  has its data (also those another call is already fetching). */
  const cardFetch = useRef(new Map<string, Promise<unknown>>());   // "t:id" | "c:id" | "b:id" -> latest fetch
  const fetchCards = useCallback(async (list: ChatMsg[]) => {
    const wait: Promise<unknown>[] = [];
    const started = new Set<string>();
    for (const m of list) {
      const c = cardOf(m);
      if (!c) continue;
      // a BOARD card, or a "board" ping: that board; a CHECK: the check (and its task); anything else: the task
      const key = c.kind === "BOARD" || c.event === "board" ? `b:${c.id}` : c.kind === "BRIEF" || c.event === "brief" ? `r:${c.id}` : c.kind === "CHECK" ? `c:${c.id}` : `t:${c.id}`;
      if (!seenCards.current.has(m.id) && !started.has(key)) {
        started.add(key);
        const go = key[0] === "b" ? refreshBoard : key[0] === "r" ? refreshBriefing : key[0] === "c" ? refreshCheck : refreshTask;
        cardFetch.current.set(key, go(c.id));
      }
      seenCards.current.add(m.id);
      wait.push(cardFetch.current.get(key)!);
    }
    await Promise.all(wait);
  }, [refreshCheck, refreshTask, refreshBoard, refreshBriefing]);
  const putTask = useCallback((task: TaskDTO, check?: CheckDTO) => {
    setTasks((s) => ({ ...s, [task.id]: task }));
    const c = check ?? task.latest_check;
    if (c) setChecks((s) => ({ ...s, [c.id]: c }));
  }, []);

  // ---- read receipts: merged by message id; users merged by user id
  const putReceipts = useCallback((rs: Receipt[] | null) => {
    if (!rs?.length) return;
    setReceipts((s) => {
      const n = { ...s };
      for (const r of rs) {
        const users = new Map((n[r.id]?.users ?? []).map((u) => [u.userId, u]));
        for (const u of r.users ?? []) users.set(u.userId, u);
        n[r.id] = { ...r, users: [...users.values()] };
      }
      return n;
    });
  }, []);
  /** Receipts can only be queried by the sender (Nexconn 26320 otherwise): my own messages, last 20. */
  const receiptIds = useCallback((list: ChatMsg[]) =>
    list.filter((m) => m.needReceipt && m.from === myId).slice(-20).map((m) => m.id), [myId]);
  const fetchReceipts = useCallback(async (list: ChatMsg[]) => {
    const t = transport.current, r = room.current;
    if (!t || !r) return;
    putReceipts(await t.receiptsFor(r, receiptIds(list), true).catch(() => null));
  }, [putReceipts, receiptIds]);

  // ---- load conversation, connect, history, subscribe
  // the live connection starts at once, in parallel with the profile and conversation loads (it needs neither)
  useEffect(() => { getTransport().then((t) => t.connect()).catch(() => {}); }, []);
  useEffect(() => {
    if (!myId) return;
    let live = true;
    let unsubMsg = () => {};
    let unsubStatus = () => {};
    let unsubReceipts = () => {};
    (async () => {
      try {
        const [c, t] = await Promise.all([api("GET /api/conversations/:id", undefined, { id: conversationId }), getTransport()]);
        if (!live) return;
        setConv(c);
        transport.current = t;
        setKind(t.kind);
        const r: Room = { conversationId, groupId: c.conversation.nexconn_group_id };
        room.current = r;
        let wasOffline = false;
        unsubStatus = t.onStatus((s) => {
          setStatus(s);
          statusRef.current = s;
          if (s === "offline") { wasOffline = true; setSynced(false); }
          // after a reconnect, re-read history so nothing is missed; merge dedupes
          if (s === "connected" && wasOffline) {
            wasOffline = false;
            t.history(r).then((h) => { merge(h); fetchReceipts(h); }).catch(() => {}).finally(() => { if (live) setSynced(true); });
          }
        });
        unsubMsg = t.subscribe(r, (m) => merge([m]));
        unsubReceipts = t.onReceipts(putReceipts);
        await t.connect().catch(() => {});
        const h = await t.history(r).catch(() => [] as ChatMsg[]);
        if (!live) return;
        // draw history with its cards filled in (no row of "Loading card" placeholders), but never wait long
        await Promise.race([fetchCards(h), new Promise((ok) => setTimeout(ok, CARD_WAIT_MS))]);
        if (!live) return;
        merge(h);
        setHistoryReady(true);
        setSynced(true);
        fetchReceipts(h);
      } catch (e) {
        if (live) setLoadError(e instanceof ApiError ? e.code : "network");
      }
    })();
    return () => { live = false; unsubMsg(); unsubStatus(); unsubReceipts(); };
  }, [conversationId, myId, merge, fetchReceipts, putReceipts, fetchCards]);

  // ---- I read it: one receipt per message that asked for one, batched, only while the tab is visible.
  // Opening the conversation also clears its Nexconn unread count.
  const acked = useRef(new Set<string>());
  useEffect(() => {
    const t = transport.current, r = room.current;
    if (!t || !r || !myId || !historyReady) return;
    const flush = () => {
      if (document.visibilityState !== "visible") return;
      const ids = msgs.filter((m) => m.from !== myId && m.needReceipt && !m.sentReceipt && !acked.current.has(m.id)).map((m) => m.id);
      ids.forEach((id) => acked.current.add(id));
      t.markRead(r, ids);
      t.clearUnread(r);
    };
    const timer = setTimeout(flush, 400);
    document.addEventListener("visibilitychange", flush);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", flush); };
  }, [msgs, myId, historyReady]);

  // ---- my sends after load: their receipt arrives by push; ask once too, in case it came before we listened
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!historyReady || kind !== "nexconn") return;
    const fresh = msgs.filter((m) => receiptIds([m]).length && !receipts[m.id] && !asked.current.has(m.id));
    if (fresh.length) { fresh.forEach((m) => asked.current.add(m.id)); fetchReceipts(fresh); }
  }, [historyReady, kind, msgs, receipts, fetchReceipts, receiptIds]);

  // ---- every card that arrives refreshes its task (and check) — both windows stay in step
  useEffect(() => { void fetchCards(msgs); }, [msgs, fetchCards]);

  // ---- language changed: everything the server put in words is in the old language. Answers still on their
  // way are dropped (gen), translations start over, and every card is fetched again; until the new data lands
  // the card keeps its old words rather than flashing a placeholder.
  const msgsRef = useRef(msgs);
  useEffect(() => { msgsRef.current = msgs; }, [msgs]);
  const prevLang = useRef(lang);
  useEffect(() => {
    if (!lang || prevLang.current === lang) { prevLang.current = lang; return; }
    prevLang.current = lang;
    gen.current++;
    trQueue.current = [];
    seenCards.current.clear();
    setTr({}); setGone({});
    void fetchCards(msgsRef.current);
  }, [lang, fetchCards]);

  // ---- translation: original shows at once; translations batched (<= 50), one request per id at a time
  const sendBatch = useCallback(async (batch: { id: string; text: string }[], cachedOnly?: boolean) => {
    const g = gen.current;
    try {
      const { translations } = await api("POST /api/translate", { conversation_id: conversationId, messages: batch, ...(cachedOnly ? { cached_only: true } : {}) });
      if (g !== gen.current) return;
      const got = new Map(translations.map((d) => [d.id, d]));
      setTr((s) => {
        const n = { ...s };
        for (const b of batch) {
          const d = got.get(b.id);
          n[b.id] = d && !d.error ? { state: "done", dto: d } : { state: "error" };
        }
        return n;
      });
    } catch (e) {
      if (g !== gen.current) return;
      const st = e instanceof ApiError && e.status === 429 ? "slow" : "error";
      setTr((s) => { const n = { ...s }; for (const b of batch) n[b.id] = { state: st }; return n; });
    }
  }, [conversationId]);
  // Newest first, three per request: each request is one AI round on the server, so what is on screen gets its
  // translation after one round instead of waiting for the whole batch (and one slow message holds back only its
  // own three). As before only the newest 12 may cost an AI call; older ones are answered from the cache.
  const flush = useCallback(() => {
    const q = trQueue.current.splice(0);
    const fresh = q.splice(-12);
    while (fresh.length) void sendBatch(fresh.splice(-3));
    while (q.length) void sendBatch(q.splice(0, 50), true);
  }, [sendBatch]);
  const enqueue = useCallback((items: { id: string; text: string }[]) => {
    if (!items.length) return;
    setTr((s) => { const n = { ...s }; for (const i of items) n[i.id] = { state: "pending" }; return n; });
    trQueue.current.push(...items);
    clearTimeout(trTimer.current);
    trTimer.current = setTimeout(flush, 0);
  }, [flush]);

  useEffect(() => {
    if (!myId) return;
    const todo = msgs.filter((m) => m.from !== myId && !cardOf(m) && m.text.trim() && !tr[m.id]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks new ids pending; guarded by !tr[id]
    enqueue(todo.map((m) => ({ id: m.id, text: m.text })));
  }, [msgs, tr, myId, enqueue]);

  const retryTranslate = useCallback((m: ChatMsg) => enqueue([{ id: m.id, text: m.text }]), [enqueue]);
  const flag = useCallback(async (messageId: string) => {
    await api("POST /api/translate/flag", { conversation_id: conversationId, message_id: messageId });
    setTr((s) => { const t = s[messageId]; return t?.state === "done" ? { ...s, [messageId]: { state: "done", dto: { ...t.dto, flagged: true } } } : s; });
  }, [conversationId]);

  // ---- sending. Every message goes through a small outbox: it shows at once, waits while there is no live
  // connection (kept in sessionStorage, so a reload does not lose it), and is sent in order once connected.
  // A send the server refuses while connected stays in place, marked, tap to retry.
  const statusRef = useRef<LinkStatus>("connecting");
  const [restoredFor, setRestoredFor] = useState<string | null>(null);   // whose outbox `pending` holds
  useEffect(() => {
    let saved: Pending[] = [];
    try { saved = JSON.parse(sessionStorage.getItem(outboxKey(conversationId)) ?? "[]"); } catch { /* none */ }
    // after a reload nothing is "sending" any more: it may or may not have arrived, so it is checked against history
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores this tab's outbox once per conversation
    setPending(saved.map((p) => (p.state === "sending" ? { ...p, state: "queued", tried: true } : p)));
    setRestoredFor(conversationId);
  }, [conversationId]);
  useEffect(() => {
    if (restoredFor !== conversationId) return;   // not restored yet: writing now would wipe the saved outbox
    try {
      if (pending.length) sessionStorage.setItem(outboxKey(conversationId), JSON.stringify(pending));
      else sessionStorage.removeItem(outboxKey(conversationId));
    } catch { /* storage full or blocked: the outbox still works for this page */ }
  }, [pending, conversationId, restoredFor]);

  const sendingNow = useRef(false);
  useEffect(() => {
    const t = transport.current, r = room.current;
    if (sendingNow.current || !t || !r || status !== "connected" || restoredFor !== conversationId) return;
    const next = pending.find((p) => p.state === "queued");
    if (!next || (next.tried && !synced)) return;   // in order: a maybe-delivered one waits for history first
    // tried before (reload, or the line dropped mid-send): if history already has it, it arrived — do not send twice
    if (next.tried) {
      const mine = msgs.filter((m) => m.from === myId && m.text === next.text && m.at >= next.at - 5000);
      const claimed = pending.filter((p) => p.tempId !== next.tempId && p.text === next.text && p.state !== "queued").length;
      if (mine.length > claimed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- drops an already-delivered outbox entry
        setPending((ps) => ps.filter((x) => x.tempId !== next.tempId));
        return;
      }
    }
    sendingNow.current = true;
    setPending((ps) => ps.map((x) => (x.tempId === next.tempId ? { ...x, state: "sending", tried: true } : x)));
    t.send(r, next.text, next.mentions).then(
      (m) => { merge([m]); setPending((ps) => ps.filter((x) => x.tempId !== next.tempId)); },
      // the line went down meanwhile: back in the queue; refused while connected: a real failure
      () => setPending((ps) => ps.map((x) => (x.tempId === next.tempId ? { ...x, state: statusRef.current === "connected" ? "failed" : "queued" } : x))),
    ).finally(() => { sendingNow.current = false; setPending((ps) => [...ps]); });   // re-run this effect for the next one
  }, [pending, status, synced, msgs, myId, merge, restoredFor, conversationId]);

  const send = useCallback((text: string, mentions?: string[]) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [...p, { tempId, text, state: "queued", at: Date.now(), mentions }]);
  }, []);
  const retrySend = useCallback((p: Pending) => {
    setPending((ps) => ps.map((x) => (x.tempId === p.tempId ? { ...x, state: "queued" } : x)));
  }, []);

  return {
    conv, loadError, status, kind, msgs, historyReady, pending, tasks, checks, boards, briefings, gone, tr, receipts,
    send, retrySend, retryTranslate, flag, refreshTask, refreshCheck, refreshBoard, refreshBriefing, putBriefing, putTask,
  };
}
export type ConversationState = ReturnType<typeof useConversation>;
