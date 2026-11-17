"use client";
// One conversation's live state: messages (deduped by id, ordered by time), translations,
// task and check data for cards, connection status. The single place where messages merge.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/session";
import { getTransport, type ChatTransport, type LinkStatus, type Receipt, type Room } from "@/lib/client/transport";
import { BOT_USER_ID, parseCard, type Api, type BroadcastDTO, type ChatMsg, type CheckDTO, type Me, type TaskDTO, type TranslationDTO } from "@/lib/types";

type ConvRes = Api["GET /api/conversations/:id"]["res"];
export type Tr = { state: "pending" } | { state: "done"; dto: TranslationDTO } | { state: "error" | "slow" };
export type Pending = { tempId: string; text: string; failed: boolean; mentions?: string[] };

/** A message is a card only when it parses AND the server bot sent it (PRD security rule). */
export const cardOf = (m: ChatMsg) => (m.from === BOT_USER_ID ? parseCard(m.text) : null);

const byTime = (a: ChatMsg, b: ChatMsg) => a.at - b.at || (a.id < b.id ? -1 : 1);

export function useConversation(conversationId: string, me: Me | null) {
  const [conv, setConv] = useState<ConvRes | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [kind, setKind] = useState<ChatTransport["kind"] | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [tasks, setTasks] = useState<Record<string, TaskDTO>>({});
  const [checks, setChecks] = useState<Record<string, CheckDTO>>({});
  const [boards, setBoards] = useState<Record<string, BroadcastDTO>>({});   // crew channel: roll-call boards by broadcast id
  const [gone, setGone] = useState<Record<string, true>>({}); // card ids whose task/check no longer exists
  const [tr, setTr] = useState<Record<string, Tr>>({});
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});   // Nexconn read receipts by message id

  const transport = useRef<ChatTransport | null>(null);
  const room = useRef<Room | null>(null);
  const seenCards = useRef(new Set<string>());
  const trQueue = useRef<{ id: string; text: string }[]>([]);
  const trTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    try {
      const { task } = await api("GET /api/tasks/:id", undefined, { id: taskId });
      setTasks((s) => ({ ...s, [task.id]: task }));
      if (task.latest_check) { const c = task.latest_check; setChecks((s) => ({ ...s, [c.id]: c })); }
      return task;
    } catch (e) { if (e instanceof ApiError && e.status === 404) setGone((g) => ({ ...g, [taskId]: true })); return null; }
  }, []);
  const refreshCheck = useCallback(async (checkId: string) => {
    try {
      const { check, task } = await api("GET /api/checks/:id", undefined, { id: checkId });
      setChecks((s) => ({ ...s, [check.id]: check }));
      setTasks((s) => ({ ...s, [task.id]: task }));
    } catch (e) { if (e instanceof ApiError && e.status === 404) setGone((g) => ({ ...g, [checkId]: true })); }
  }, []);
  const refreshBoard = useCallback(async (id: string) => {
    try {
      const { broadcast } = await api("GET /api/broadcasts/:id", undefined, { id });
      setBoards((s) => ({ ...s, [id]: broadcast }));
    } catch (e) { if (e instanceof ApiError && e.status === 404) setGone((g) => ({ ...g, [id]: true })); }
  }, []);
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
  useEffect(() => {
    if (!myId) return;
    let live = true;
    let unsubMsg = () => {};
    let unsubStatus = () => {};
    let unsubReceipts = () => {};
    (async () => {
      try {
        const c = await api("GET /api/conversations/:id", undefined, { id: conversationId });
        if (!live) return;
        setConv(c);
        const t = await getTransport();
        if (!live) return;
        transport.current = t;
        setKind(t.kind);
        const r: Room = { conversationId, groupId: c.conversation.nexconn_group_id };
        room.current = r;
        let wasOffline = false;
        unsubStatus = t.onStatus((s) => {
          setStatus(s);
          if (s === "offline") wasOffline = true;
          // after a reconnect, re-read history so nothing is missed; merge dedupes
          if (s === "connected" && wasOffline) {
            wasOffline = false;
            t.history(r).then((h) => { merge(h); fetchReceipts(h); }).catch(() => {});
          }
        });
        unsubMsg = t.subscribe(r, (m) => merge([m]));
        unsubReceipts = t.onReceipts(putReceipts);
        await t.connect().catch(() => {});
        const h = await t.history(r).catch(() => [] as ChatMsg[]);
        if (!live) return;
        merge(h);
        setHistoryReady(true);
        fetchReceipts(h);
      } catch (e) {
        if (live) setLoadError(e instanceof ApiError ? e.code : "network");
      }
    })();
    return () => { live = false; unsubMsg(); unsubStatus(); unsubReceipts(); };
  }, [conversationId, myId, merge, fetchReceipts, putReceipts]);

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
  useEffect(() => {
    const taskIds = new Set<string>();
    const checkIds = new Set<string>();
    const boardIds = new Set<string>();   // a BOARD card, or a "board" ping: refetch that board
    for (const m of msgs) {
      if (seenCards.current.has(m.id)) continue;
      const c = cardOf(m);
      if (!c) continue;
      seenCards.current.add(m.id);
      if (c.kind === "BOARD" || c.event === "board") boardIds.add(c.id);
      else if (c.kind === "CHECK") checkIds.add(c.id); else taskIds.add(c.id);
    }
    checkIds.forEach((id) => refreshCheck(id));
    taskIds.forEach((id) => refreshTask(id));
    boardIds.forEach((id) => refreshBoard(id));
  }, [msgs, lang, refreshCheck, refreshTask, refreshBoard]);

  // language changed: drop translations and card data in the old language
  useEffect(() => {
    if (!lang) return;
    const seen = seenCards.current;
    return () => { seen.clear(); setTr({}); setTasks({}); setChecks({}); setBoards({}); };
  }, [lang]);

  // ---- translation: original shows at once; translations batched (<= 50), one request per id at a time
  const sendBatch = useCallback(async (batch: { id: string; text: string }[]) => {
    try {
      const { translations } = await api("POST /api/translate", { conversation_id: conversationId, messages: batch });
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
      const st = e instanceof ApiError && e.status === 429 ? "slow" : "error";
      setTr((s) => { const n = { ...s }; for (const b of batch) n[b.id] = { state: st }; return n; });
    }
  }, [conversationId]);
  const flush = useCallback(() => {
    while (trQueue.current.length) void sendBatch(trQueue.current.splice(0, 50));
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

  // ---- sending (failed sends stay in place, marked, tap to retry)
  const sendRaw = useCallback(async (tempId: string, text: string, mentions?: string[]) => {
    const t = transport.current, r = room.current;
    try {
      if (!t || !r) throw new Error("not ready");
      const m = await t.send(r, text, mentions);
      merge([m]);
      setPending((p) => p.filter((x) => x.tempId !== tempId));
    } catch {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, failed: true } : x)));
    }
  }, [merge]);
  const send = useCallback((text: string, mentions?: string[]) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [...p, { tempId, text, failed: false, mentions }]);
    return sendRaw(tempId, text, mentions);
  }, [sendRaw]);
  const retrySend = useCallback((p: Pending) => {
    setPending((ps) => ps.map((x) => (x.tempId === p.tempId ? { ...x, failed: false } : x)));
    return sendRaw(p.tempId, p.text, p.mentions);
  }, [sendRaw]);

  return {
    conv, loadError, status, kind, msgs, historyReady, pending, tasks, checks, boards, gone, tr, receipts,
    send, retrySend, retryTranslate, flag, refreshTask, refreshCheck, refreshBoard, putTask,
  };
}
export type ConversationState = ReturnType<typeof useConversation>;
