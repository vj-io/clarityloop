"use client";
// Nexconn read receipts under my own bubbles, drawn small. Nothing is drawn unless the SDK returned a receipt
// (local transport / receipts off: no lines at all). Only a message's sender may query its receipts (26320 otherwise),
// so server-bot cards get none here.
import { useState } from "react";
import type { T } from "@/lib/i18n";
import type { Receipt } from "@/lib/client/transport";
import { MarkIcon } from "@/components/ui";
import { hhmm } from "./Bubble";

const lastAt = (users: { at: number }[]) => (users.length ? Math.max(...users.map((u) => u.at)) : 0);

/** Under my own bubble. Pair: "Read 14:02". Crew: "Read by 2 of 3", tap for who and when. */
export function ReceiptLine({ r, crew, myId, names, t }: {
  r: Receipt | undefined; crew: boolean; myId: string; names: Record<string, string>; t: T;
}) {
  const [open, setOpen] = useState(false);
  if (!r || r.read <= 0) return null;
  const users = (r.users ?? []).filter((u) => u.userId !== myId && u.at > 0);
  const tick = <MarkIcon mark="match" size={14} />;
  if (!crew) {
    const at = lastAt(users);
    return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-ok">{tick}{t("v.read", { time: at ? hhmm(at) : "" }).trim()}</span>;
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="-my-3 inline-flex min-h-12 items-center gap-0.5 text-xs font-semibold text-ok underline decoration-dotted underline-offset-2">
        {tick}{t("v.readBy", { n: r.read, total: r.total })}
      </button>
      {open && users.length > 0 && (
        <ul className="mt-1 text-right text-xs text-muted">
          {users.map((u) => <li key={u.userId}>{names[u.userId] ?? "?"} · <span className="font-mono">{hhmm(u.at)}</span></li>)}
        </ul>
      )}
    </span>
  );
}
