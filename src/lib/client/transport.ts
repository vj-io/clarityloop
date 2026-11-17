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

/** A Nexconn read receipt. `users` (who, when) only where the SDK returns them. */
export type Receipt = { id: string; read: number; total: number; users?: { userId: string; at: number }[] };
/** Unread state per Nexconn group id. */
export type Unread = Record<string, { n: number; mention: boolean }>;

export interface ChatTransport {
  kind: Config["transport"];
  connect(): Promise<void>;
  onStatus(cb: (s: LinkStatus) => void): () => void;
  subscribe(room: Room, cb: (m: ChatMsg) => void): () => void;
  /** any message in any room (inbox unread refresh) */
  onAnyMessage(cb: () => void): () => void;
  /** mentions: Nexconn user ids @mentioned in the text */
  send(room: Room, text: string, mentions?: string[]): Promise<ChatMsg>;
  /** oldest first, last 100 */
  history(room: Room): Promise<ChatMsg[]>;
  // Read receipts and unread counts. The local transport has none: null / no-ops, and the UI draws nothing.
  markRead(room: Room, ids: string[]): void;
  onReceipts(cb: (r: Receipt[]) => void): () => void;
  /** null = receipts unsupported here. withUsers also lists who read and when (one query per read message). */
  receiptsFor(room: Room, ids: string[], withUsers?: boolean): Promise<Receipt[] | null>;
  unread(): Promise<Unread | null>;
  clearUnread(room: Room): void;
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
    onAnyMessage: () => () => {},
    markRead() {},
    onReceipts: () => () => {},
    receiptsFor: async () => null,
    unread: async () => null,
    clearUnread() {},
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

  const receiptSubs = new Set<(r: Receipt[]) => void>();
  // Receipt service off for this app (26314 unavailable / 26315 not supported): stop asking, draw nothing.
  let receiptsOff = false;
  const receiptFail = (where: string, code: number | string) => {
    if ((code === 26314 || code === 26315) && !receiptsOff) { receiptsOff = true; console.debug(`[clarityloop] read receipts off: ${where} ${code}`); }
  };

  const toMsg = (nc: NC, m: InstanceType<NC["Message"]>): ChatMsg | null => {
    if (m.messageType !== nc.MessageType.TEXT) return null;
    const c = m.content as { text?: string; mentionedInfo?: { userIdList?: string[] } } | undefined;
    return {
      id: m.messageId, from: m.senderUserId, text: String(c?.text ?? ""), at: m.sentTime,
      needReceipt: m.needReceipt, sentReceipt: m.sentReceipt, mentions: c?.mentionedInfo?.userIdList,
    };
  };

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
      onMessageReceiptResponse({ responses }) {
        const rs = responses.map((r) => ({
          id: r.messageId, read: r.readCount, total: r.totalCount, users: r.users?.map((u) => ({ userId: u.userId, at: u.timestamp })),
        }));
        receiptSubs.forEach((f) => f(rs));
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
    onAnyMessage(cb) {
      const f = () => cb();
      listeners.add(f);
      return () => { listeners.delete(f); };
    },
    async send(room, text, mentions) {
      const nc = await load();
      const p = new nc.SendTextMessageParams(mentions?.length
        ? { text, mentionedInfo: { type: nc.MentionedType.USERS, userIdList: mentions } } : { text });
      p.needReceipt = true;
      const r = await new nc.GroupChannel(room.groupId).sendMessage(p);
      if (!r.isOk || !r.data) throw new Error(`send ${r.code}`);
      // our own message may not echo back through onMessageReceived; the store dedupes if it does
      return { id: r.data.messageId, from: r.data.senderUserId, text, at: r.data.sentTime, needReceipt: true, mentions };
    },
    markRead(room, ids) {
      if (receiptsOff || !ids.length) return;
      load().then((nc) => new nc.GroupChannel(room.groupId).sendReadReceiptResponse(ids))
        .then((r) => { if (!r.isOk) receiptFail("respond", r.code); }).catch(() => {});
    },
    onReceipts(cb) { receiptSubs.add(cb); return () => { receiptSubs.delete(cb); }; },
    async receiptsFor(room, ids, withUsers) {
      if (receiptsOff) return null;
      if (!ids.length) return [];
      const nc = await load();
      const r = await new nc.GroupChannel(room.groupId).getMessageReadReceiptInfo(ids);
      if (!r.isOk || !r.data) { receiptFail("info", r.code); return receiptsOff ? null : []; }
      const out: Receipt[] = r.data.map((i) => ({ id: i.messageId, read: i.readCount, total: i.totalCount }));
      if (withUsers) {
        await Promise.all(out.filter((x) => x.read > 0).map(async (x) => {
          const u = await nc.BaseChannel.createMessagesReadReceiptUsersQuery({
            channelIdentifier: new nc.GroupChannelIdentifier(room.groupId), messageId: x.id,
            status: nc.MessageReadReceiptStatus.RESPONDED, pageSize: 50,
          }).loadNextPage();
          if (u.isOk && u.data) x.users = u.data.data.map((v) => ({ userId: v.userId, at: v.timestamp }));
        }));
      }
      return out;
    },
    async unread() {
      const nc = await load();
      let r = await nc.BaseChannel.createChannelsQuery({ pageSize: 50 }).loadNextPage();
      // 35011 METHOD_NOT_AVAILABLE: the channel list is not synced yet right after connect; wait and ask again
      for (let i = 0; i < 6 && r.code === 35011; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await nc.BaseChannel.createChannelsQuery({ pageSize: 50 }).loadNextPage();
      }
      if (!r.isOk || !r.data) return null;
      const out: Unread = {};
      for (const c of r.data.data) if (c.channelType === nc.ChannelType.GROUP) out[c.channelId] = { n: c.unreadCount, mention: false };
      const m = await nc.BaseChannel.createUnreadMentionMeChannelsQuery({ channelTypes: [nc.ChannelType.GROUP] }).loadNextPage().catch(() => null);
      if (m?.isOk && m.data) for (const c of m.data.data) (out[c.channelId] ??= { n: c.unreadCount, mention: false }).mention = true;
      return out;
    },
    clearUnread(room) {
      load().then((nc) => new nc.GroupChannel(room.groupId).clearUnreadCount()).catch(() => {});
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
