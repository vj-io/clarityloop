// Nexconn server REST calls with plain fetch. Endpoints come from doc research and are
// untested against the live service: every call logs ok/code/ms to health_events so the
// first live run is diagnosable from /api/health.
import { createHash, randomBytes } from "node:crypto";
import { BOT_USER_ID } from "../types.ts";
import { logHealth } from "./db.ts";

export type Area = "SG" | "NA" | "SA";
const HOSTS: Record<Area, [string, string]> = {
  SG: ["https://api.sg-light-api.com", "https://api-b.sg-light-api.com"],
  NA: ["https://api.us-light-api.com", "https://api-b.us-light-api.com"],
  SA: ["https://api.sau-light-api.com", "https://api-b.sau-light-api.com"],
};

export const nexconnArea = (): Area => {
  const a = process.env.NEXCONN_AREA?.toUpperCase();
  return a === "NA" || a === "SA" ? a : "SG";
};
export const nexconnConfigured = () => Boolean(process.env.NEXCONN_APP_KEY && process.env.NEXCONN_APP_SECRET);
export const transport = (): "nexconn" | "local" => (nexconnConfigured() ? "nexconn" : "local");

export class NexconnError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

type Reply = { code?: number; result?: Record<string, unknown>; errorMessage?: string; msg?: string };

async function post(kind: string, path: string, payload: unknown): Promise<{ status: number; body: Reply }> {
  const key = process.env.NEXCONN_APP_KEY!, secret = process.env.NEXCONN_APP_SECRET!;
  const t0 = Date.now();
  let last: NexconnError | undefined;
  for (const host of HOSTS[nexconnArea()]) {
    const nonce = randomBytes(9).toString("hex");
    const timestamp = String(Date.now());
    try {
      const res = await fetch(host + path, {
        method: "POST",
        headers: {
          "App-Key": key, Nonce: nonce, Timestamp: timestamp,
          Signature: createHash("sha1").update(secret + nonce + timestamp).digest("hex"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      const body = (await res.json().catch(() => ({}))) as Reply;
      if (res.status >= 500) { last = new NexconnError(`http_${res.status}`, `${path} ${res.status}`); continue; } // backup domain
      const good = res.ok && body.code === 0;
      await logHealth(kind, good, good ? null : String(body.code ?? `http_${res.status}`), Date.now() - t0);
      return { status: res.status, body };
    } catch (e) {
      last = new NexconnError("timeout_or_network", `${path}: ${e instanceof Error ? e.message : e}`); // retry on backup
    }
  }
  await logHealth(kind, false, last?.code ?? "unknown", Date.now() - t0);
  throw last ?? new NexconnError("unknown", path);
}

const okOrThrow = (path: string, r: { status: number; body: Reply }) => {
  if (r.status >= 200 && r.status < 300 && r.body.code === 0) return r.body;
  throw new NexconnError(String(r.body.code ?? `http_${r.status}`), `${path}: ${r.body.errorMessage ?? r.body.msg ?? r.status}`);
};

/** Registers the user if new (idempotent) and returns an access token. */
export async function issueToken(userId: string, name: string): Promise<string> {
  const p = "/v4/auth/access-token/issue";
  const b = okOrThrow(p, await post("nexconn_token", p, { userId, name }));
  return String(b.result?.accessToken ?? "");
}

/** Create the group, or join everyone if it already exists. */
export async function ensureGroup(channelId: string, name: string, owner: string, userIds: string[]) {
  const create = await post("nexconn_group", "/v4/group-channel/create", { channelId, name, owner, userIds });
  if (create.status >= 200 && create.status < 300 && create.body.code === 0) return;
  // ponytail: any non-zero create reply is read as "already exists"; a real failure surfaces on the join below.
  okOrThrow("/v4/group-channel/join", await post("nexconn_group", "/v4/group-channel/join", { channelId, userIds }));
}

let botReady: Promise<string> | undefined;
/** Send a text into a group as the ClarityLoop bot. Returns the Nexconn message id. */
export async function sendGroupText(channelId: string, text: string): Promise<string | null> {
  botReady ??= issueToken(BOT_USER_ID, "ClarityLoop").catch((e) => { botReady = undefined; throw e; });
  await botReady;
  const p = "/v4/group-channel/message/send";
  const b = okOrThrow(p, await post("nexconn_send", p, {
    fromUserId: BOT_USER_ID, toChannelIds: [channelId], messageType: "RC:TxtMsg",
    content: JSON.stringify({ content: text }), isEchoToSender: 0, shouldPersist: 1, needReadReceipt: 1,
  }));
  const ids = b.result?.messageIds as { channelId: string; messageId: string }[] | undefined;
  return ids?.[0]?.messageId ?? null;
}
