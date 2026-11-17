// Live chat transport. Two implementations behind one small interface, picked by GET /api/config:
//  - "local":   polls our own /api/local/messages (used until Nexconn keys are configured)
//  - "nexconn": the Nexconn Web SDK, loaded lazily in the browser only
// Dedupe and ordering are NOT done here: the conversation store merges by message id.
"use client";
import { api } from "@/lib/client/session";
import type { Api, ChatMsg } from "@/lib/types";

export type Room = { conversationId: string; groupId: string };
export type LinkStatus = "connecting" | "connected" | "offline";
type Config = Api["GET /api/config"]["res"];

export interface ChatTransport {
  kind: Config["transport"];
  connect(): Promise<void>;
  onStatus(cb: (s: LinkStatus) => void): () => void;
  subscribe(room: Room, cb: (m: ChatMsg) => void): () => void;
  send(room: Room, text: string): Promise<ChatMsg>;
  /** oldest first, last 100 */
  history(room: Room): Promise<ChatMsg[]>;
}

let cached: Promise<ChatTransport> | null = null;
/** One transport per page load (React Strict Mode runs effects twice). */
export function getTransport(): Promise<ChatTransport> {
  cached ??= api("GET /api/config").then((c) => (c.transport === "nexconn" && c.nexconn_app_key ? nexconn(c) : local()))
    .catch((e) => { cached = null; throw e; });
  return cached;
}

/** Small status hub shared by both implementations. */
function statusHub() {
  let cur: LinkStatus = "connecting";
  const subs = new Set<(s: LinkStatus) => void>();
  return {
    get: () => cur,
    set(s: LinkStatus) { if (s === cur) return; cur = s; subs.forEach((f) => f(s)); },
    on(cb: (s: LinkStatus) => void) { subs.add(cb); cb(cur); return () => { subs.delete(cb); }; },
  };
}

// ---------------------------------------------------------------- local (polling)
function local(): ChatTransport {
  const st = statusHub();
  const ok = <T,>(p: Promise<T>) => p.then((v) => { st.set("connected"); return v; }, (e) => { st.set("offline"); throw e; });
  const fetchAfter = (room: Room, after: number) =>
    ok(api("GET /api/local/messages?conversation_id=&after=", undefined, { conversation_id: room.conversationId, after })).then((r) => r.messages);

  return {
    kind: "local",
    async connect() { await ok(api("GET /api/config")); },
    onStatus: st.on,
    subscribe(room, cb) {
      let last = Date.now() - 60_000;
      let stop = false;
      let timer: ReturnType<typeof setTimeout>;
      const tick = async () => {
        if (stop) return;
        if (document.visibilityState === "visible") {
          try {
            // ponytail: re-reads a 3 s window so late-committed rows are not skipped; the store dedupes by id.
            const ms = await fetchAfter(room, Math.max(0, last - 3000));
            for (const m of ms) { last = Math.max(last, m.at); cb(m); }
          } catch { /* status already set to offline; keep polling */ }
        }
        timer = setTimeout(tick, st.get() === "offline" ? 3000 : 800);
      };
      const vis = () => { if (document.visibilityState === "visible") { clearTimeout(timer); tick(); } };
      document.addEventListener("visibilitychange", vis);
      tick();
      return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
    },
    async send(room, text) {
      return (await ok(api("POST /api/local/messages", { conversation_id: room.conversationId, text }))).message;
    },
    async history(room) {
      const ms = await fetchAfter(room, 0);
      return ms.slice(-100);
    },
  };
}

// ---------------------------------------------------------------- Nexconn Web SDK
type NC = typeof import("@nexconn/chat");
const BACKOFF = [2000, 5000, 15000, 30000];

function nexconn(cfg: Config): ChatTransport {
  const st = statusHub();
  const listeners = new Set<(groupId: string, m: ChatMsg) => void>();
  let sdk: Promise<NC> | null = null;
  let connecting: Promise<void> | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const toMsg = (nc: NC, m: InstanceType<NC["Message"]>): ChatMsg | null =>
    m.messageType === nc.MessageType.TEXT
      ? { id: m.messageId, from: m.senderUserId, text: String((m.content as { text?: string })?.text ?? ""), at: m.sentTime }
      : null;

  // initialize + handlers exactly once per page load, BEFORE connect
  const load = () => (sdk ??= import("@nexconn/chat").then((nc) => {
    nc.NCEngine.initialize({ appKey: cfg.nexconn_app_key!, areaCode: nc.AreaCode[cfg.nexconn_area] ?? nc.AreaCode.SG, logLevel: nc.LogLevel.WARN });
    nc.NCEngine.addConnectionStatusHandler("cl-status", new nc.ConnectionStatusHandler({
      onConnectionStatusChanged({ status, code }) {
        if (status === nc.ConnectionStatus.CONNECTED) { attempt = 0; st.set("connected"); }
        else if (status === nc.ConnectionStatus.CONNECTING) st.set("connecting");
        else {
          st.set("offline");
          // SUSPENDED: the SDK retries by itself. DISCONNECTED with a code: token expired / kicked -> fresh token.
          if (status === nc.ConnectionStatus.DISCONNECTED && code) scheduleRetry();
        }
      },
    }));
    nc.NCEngine.addMessageHandler("cl-messages", new nc.MessageHandler({
      onMessageReceived({ messages }) {
        for (const m of messages) {
          const msg = toMsg(nc, m);
          if (msg) listeners.forEach((f) => f(m.channelIdentifier.channelId, msg));
        }
      },
    }));
    return nc;
  }));

  const scheduleRetry = () => {
    clearTimeout(retryTimer);
    const wait = BACKOFF[Math.min(attempt++, BACKOFF.length - 1)];
    retryTimer = setTimeout(() => { connecting = null; connect().catch(() => {}); }, wait);
  };

  async function connect(): Promise<void> {
    if (st.get() === "connected") return;
    connecting ??= (async () => {
      const nc = await load();
      st.set("connecting");
      try {
        const { token } = await api("POST /api/nexconn/token");
        if (!token) throw new Error("no token");
        const r = await nc.NCEngine.connect({ token });
        if (!r.isOk) throw new Error(`connect ${r.code}`);
        attempt = 0;
        st.set("connected");
      } catch (e) {
        st.set("offline");
        scheduleRetry();
        throw e;
      }
    })();
    return connecting;
  }

  return {
    kind: "nexconn",
    connect,
    onStatus: st.on,
    subscribe(room, cb) {
      const f = (gid: string, m: ChatMsg) => { if (gid === room.groupId) cb(m); };
      listeners.add(f);
      return () => { listeners.delete(f); };
    },
    async send(room, text) {
      const nc = await load();
      const r = await new nc.GroupChannel(room.groupId).sendMessage(new nc.SendTextMessageParams({ text }));
      if (!r.isOk || !r.data) throw new Error(`send ${r.code}`);
      // our own message may not echo back through onMessageReceived; the store dedupes if it does
      return { id: r.data.messageId, from: r.data.senderUserId, text, at: r.data.sentTime };
    },
    async history(room) {
      const nc = await load();
      const q = nc.BaseChannel.createMessagesQuery({ channelIdentifier: new nc.GroupChannelIdentifier(room.groupId), pageSize: 100, isAscending: false });
      const r = await q.loadNextPage();
      if (!r.isOk || !r.data) throw new Error(`history ${r.code}`);
      return r.data.data.map((m) => toMsg(nc, m)).filter((m): m is ChatMsg => !!m).reverse();
    },
  };
}
