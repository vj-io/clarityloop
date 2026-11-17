"use client";
// One conversation's live state: messages (deduped by id, ordered by time), translations,
// task and check data for cards, connection status. The single place where messages merge.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/session";
import { getTransport, type ChatTransport, type LinkStatus, type Room } from "@/lib/client/transport";
import { BOT_USER_ID, parseCard, type Api, type ChatMsg, type CheckDTO, type Me, type TaskDTO, type TranslationDTO } from "@/lib/types";

type ConvRes = Api["GET /api/conversations/:id"]["res"];
export type Tr = { state: "pending" } | { state: "done"; dto: TranslationDTO } | { state: "error" | "slow" };
export type Pending = { tempId: string; text: string; failed: boolean };

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
  const [tr, setTr] = useState<Record<string, Tr>>({});

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
    } catch { return null; }
  }, []);
  const refreshCheck = useCallback(async (checkId: string) => {
    try {
      const { check, task } = await api("GET /api/checks/:id", undefined, { id: checkId });
      setChecks((s) => ({ ...s, [check.id]: check }));
      setTasks((s) => ({ ...s, [task.id]: task }));
    } catch { /* card shows its loading/failed placeholder */ }
  }, []);
  const putTask = useCallback((task: TaskDTO, check?: CheckDTO) => {
    setTasks((s) => ({ ...s, [task.id]: task }));
    const c = check ?? task.latest_check;
    if (c) setChecks((s) => ({ ...s, [c.id]: c }));
  }, []);

  // ---- load conversation, connect, history, subscribe
  useEffect(() => {
    if (!myId) return;
    let live = true;
    let unsubMsg = () => {};
    let unsubStatus = () => {};
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
          if (s === "connected" && wasOffline) { wasOffline = false; t.history(r).then(merge).catch(() => {}); }
        });
        unsubMsg = t.subscribe(r, (m) => merge([m]));
        await t.connect().catch(() => {});
        const h = await t.history(r).catch(() => [] as ChatMsg[]);
        if (!live) return;
        merge(h);
        setHistoryReady(true);
      } catch (e) {
        if (live) setLoadError(e instanceof ApiError ? e.code : "network");
      }
    })();
    return () => { live = false; unsubMsg(); unsubStatus(); };
  }, [conversationId, myId, merge]);

  // ---- every card that arrives refreshes its task (and check) — both windows stay in step
  useEffect(() => {
    const taskIds = new Set<string>();
    const checkIds = new Set<string>();
    for (const m of msgs) {
      if (seenCards.current.has(m.id)) continue;
      const c = cardOf(m);
      if (!c) continue;
      seenCards.current.add(m.id);
      if (c.kind === "CHECK") checkIds.add(c.id); else taskIds.add(c.id);
    }
    checkIds.forEach((id) => refreshCheck(id));
    taskIds.forEach((id) => refreshTask(id));
  }, [msgs, lang, refreshCheck, refreshTask]);

  // language changed: drop translations and card data in the old language
  useEffect(() => {
    if (!lang) return;
    const seen = seenCards.current;
    return () => { seen.clear(); setTr({}); setTasks({}); setChecks({}); };
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
  const sendRaw = useCallback(async (tempId: string, text: string) => {
    const t = transport.current, r = room.current;
    try {
      if (!t || !r) throw new Error("not ready");
      const m = await t.send(r, text);
      merge([m]);
      setPending((p) => p.filter((x) => x.tempId !== tempId));
    } catch {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, failed: true } : x)));
    }
  }, [merge]);
  const send = useCallback((text: string) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [...p, { tempId, text, failed: false }]);
    return sendRaw(tempId, text);
  }, [sendRaw]);
  const retrySend = useCallback((p: Pending) => {
    setPending((ps) => ps.map((x) => (x.tempId === p.tempId ? { ...x, failed: false } : x)));
    return sendRaw(p.tempId, p.text);
  }, [sendRaw]);

  return {
    conv, loadError, status, kind, msgs, historyReady, pending, tasks, checks, tr,
    send, retrySend, retryTranslate, flag, refreshTask, refreshCheck, putTask,
  };
}
export type ConversationState = ReturnType<typeof useConversation>;
