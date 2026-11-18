"use client";
// Conversation: translated chat + task and meaning-check cards, live in both windows.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/session";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRequireMe } from "@/components/shell/guard";
import { Spinner } from "@/components/ui";
import { Bubble, MakeTaskButton, TheirBubble } from "@/components/chat/Bubble";
import { SiteWordsLink } from "@/components/chat/terms";
import {
  CardLoading, CheckCard, DoneCard, NudgeLine, RESTATE_STATES, RestateBox, StateLine, TaskCard, UnderstoodCard,
} from "@/components/chat/cards";
import { BoardCard } from "@/components/chat/board";
import { BriefingCard, BriefingEntry, BriefingRollCard } from "@/components/chat/briefing";
import { Composer } from "@/components/chat/Composer";
import { ReceiptLine } from "@/components/chat/receipts";
import { HelloDoodle } from "@/components/chat/doodles";
import { cardOf, useConversation } from "@/components/chat/useConversation";
import { BOT_USER_ID, LANG_NAME, LANGS, type ChatMsg, type TaskDTO } from "@/lib/types";

const BIG = new Set(["TASK", "CHECK", "understood", "done"]);
/** Cards that, when they arrive, are brought into view top first (ordinary messages only stick to the bottom). */
const FOCUS = new Set(["TASK", "CHECK", "BOARD", "BRIEF", "understood", "done"]);
const OK_INK = "text-[#0f6b31]";   // --ok darkened: 4.5:1 or better on paper, card and the soft tints
const smooth = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");
/** Height covered at the top (sticky header) and bottom (sticky composer) of the window. */
function covered() {
  let top = 0;
  for (const el of document.querySelectorAll<HTMLElement>("header")) {
    const p = getComputedStyle(el).position, r = el.getBoundingClientRect();
    if ((p === "sticky" || p === "fixed") && r.top <= 0 && r.bottom > top) top = r.bottom;
  }
  const bottom = document.querySelector("[data-composer]")?.getBoundingClientRect().height ?? 0;
  return { top, bottom };
}
/** Scroll so the card's top sits just under the header; when the card is taller than the space, the first
 *  red / unclear row (data-flag) must still be on screen. */
function revealCard(el: HTMLElement) {
  const { top, bottom } = covered();
  const room = innerHeight - top - bottom;
  const card = el.getBoundingClientRect();
  let y = scrollY + card.top - top - 8;
  const flag = el.querySelector("[data-flag]")?.getBoundingClientRect();
  if (flag && flag.bottom - card.top + 16 > room) y = scrollY + flag.bottom - (innerHeight - bottom) + 16;
  scrollTo({ top: Math.max(0, y), behavior: smooth() });
}

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { me, t } = useRequireMe();
  const s = useConversation(conversationId, me);
  const { conv, msgs, tasks, checks } = s;

  // ---- which card is live: the newest big card per task; "checking" hides once a later card exists
  const plan = useMemo(() => {
    const taskOf = (m: ChatMsg) => {
      const c = cardOf(m);
      if (!c) return null;
      return c.kind === "CHECK" ? checks[c.id]?.task_id ?? null : c.id;
    };
    const lastBig: Record<string, number> = {};
    const confirmIdx: Record<string, number> = {};
    const confirmCount: Record<string, number> = {};
    const lastCheckCopy: Record<string, number> = {}; // a CHECK is re-posted after each acceptance: draw only its newest copy
    const lastBriefCopy: Record<string, number> = {}; // a BRIEF is re-posted in the pair chat after each reply: same rule
    msgs.forEach((m, i) => {
      const c = cardOf(m), tid = taskOf(m);
      if (c?.kind === "CHECK") lastCheckCopy[c.id] = i;
      if (c?.kind === "BRIEF") lastBriefCopy[c.id] = i;
      if (!c || !tid) return;
      if (BIG.has(c.kind === "STATE" ? c.event ?? "" : c.kind)) lastBig[tid] = i;
      if (c.event === "confirmed") { confirmIdx[m.id] = confirmCount[tid] ?? 0; confirmCount[tid] = (confirmCount[tid] ?? 0) + 1; }
    });
    return { taskOf, lastBig, confirmIdx, lastCheckCopy, lastBriefCopy };
  }, [msgs, checks]);

  // ---- scrolling: stick to the newest unless the reader scrolled up
  const atBottom = useRef(true);
  const [chip, setChip] = useState(false);
  const seenCount = useRef(0);
  // "Seen is not understood": tell the server once when the assigned worker has a task on screen.
  const seenSent = useRef(new Set<string>());
  useEffect(() => {
    if (!me || me.role !== "worker") return;
    for (const task of Object.values(tasks)) {
      if (task.worker.id !== me.id || task.seen_at || seenSent.current.has(task.id)) continue;
      seenSent.current.add(task.id);
      api("POST /api/tasks/:id/seen", undefined, { id: task.id }).catch(() => seenSent.current.delete(task.id));
    }
  }, [tasks, me]);
  useEffect(() => {
    const on = () => {
      atBottom.current = innerHeight + scrollY >= document.documentElement.scrollHeight - 160;
      if (atBottom.current) setChip(false);
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const toBottom = (anim = true) => scrollTo({ top: document.documentElement.scrollHeight, behavior: anim ? smooth() : "instant" });
  // a big card that arrived after the first paint: brought into view top first once its data is drawn
  const known = useRef<Set<string> | null>(null);
  const focus = useRef<{ id: string; since: number } | null>(null);
  useLayoutEffect(() => {
    if (!s.historyReady) return;
    const grew = msgs.length > seenCount.current;
    const first = known.current === null;
    const k = (known.current ??= new Set());
    seenCount.current = msgs.length;
    for (const m of msgs) {
      if (k.has(m.id)) continue;
      k.add(m.id);
      const c = !first && cardOf(m);
      if (c && FOCUS.has(c.kind === "STATE" ? c.event ?? "" : c.kind)) focus.current = { id: m.id, since: Date.now() };
    }
    if (focus.current && Date.now() - focus.current.since > 20000) focus.current = null;   // never drawn: give up
    if (focus.current) {
      const el = document.querySelector<HTMLElement>(`[data-mid="${focus.current.id}"]`);
      // drawn (not empty, not a placeholder): reveal it; otherwise wait for the next render
      if (el && el.offsetHeight > 0 && !el.querySelector("[data-card-loading]")) {
        focus.current = null;
        revealCard(el);
        setChip(false);
      }
      return;
    }
    if (first || atBottom.current) toBottom(!first);
    else if (grew) setChip(true);
  }, [msgs, s.pending.length, s.historyReady, tasks, checks, s.boards, s.briefings]);

  if (!me) return <Shell><div className="p-6"><Spinner label={t("c.loading")} /></div></Shell>;
  if (s.loadError) {
    return (
      <Shell back="/inbox">
        <div className="mx-auto max-w-xl p-6">
          <p className="font-display text-xl font-extrabold">{t(s.loadError === "not_found" || s.loadError === "forbidden" ? "c.notFound" : "c.loadFailed")}</p>
          <Link href="/inbox" className="mt-2 inline-flex min-h-12 items-center font-semibold text-pen underline">{t("c.backToInbox")}</Link>
        </div>
      </Shell>
    );
  }

  const other = conv?.conversation.other;
  const isCrew = conv?.conversation.kind === "crew";
  const isSup = me.role === "supervisor";
  const onTask = (task: TaskDTO) => s.putTask(task);
  // "Make this a task" (supervisor): under my own messages and the other person's
  const makeTask = (text: string, language: (typeof LANGS)[number]) =>
    isSup ? <MakeTaskButton conversationId={conversationId} text={text} language={language} t={t} /> : undefined;
  const focusRestate = (taskId: string) => {
    const el = document.getElementById(`restate-${taskId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };
  const restateFor = (task: TaskDTO, live: boolean) =>
    live && me.id === task.worker.id && RESTATE_STATES.includes(task.state)
      ? <RestateBox task={task} t={t} lang={me.language} onResult={(tk, ck) => s.putTask(tk, ck)} />
      : null;
  const myNc = me.nexconn_user_id;
  const names: Record<string, string> = {};
  for (const [nc, p] of Object.entries(conv?.members ?? {})) names[nc] = p.display_name;
  const mentionable = isCrew ? Object.entries(names).filter(([nc]) => nc !== myNc && nc !== BOT_USER_ID).map(([id, name]) => ({ id, name })) : undefined;

  let loaders = 0;   // never more than one "Loading card" placeholder on screen
  const loading = (retry: () => void) => (loaders++ ? null : <CardLoading t={t} onRetry={retry} />);
  function renderMsg(m: ChatMsg, i: number) {
    const c = cardOf(m);
    if (!c) {
      if (m.from === myNc) {
        return <Bubble mine text={m.text} at={m.at} t={t} actions={makeTask(m.text, me!.language)}
          status={<ReceiptLine r={s.receipts[m.id]} crew={!!isCrew} myId={myNc} names={names} t={t} />} />;
      }
      const name = m.from === BOT_USER_ID ? "ClarityLoop" : conv?.members[m.from]?.display_name;
      return <TheirBubble m={m} name={name} tr={s.tr[m.id]} t={t} lang={me!.language} atMe={!!m.mentions?.includes(myNc)}
        onRetry={() => s.retryTranslate(m)} onFlag={() => s.flag(m.id)}
        actions={m.from === BOT_USER_ID ? undefined : makeTask(m.text, conv?.members[m.from]?.language ?? me!.language)}
        onSuggest={async (word, meaning) => { await api("POST /api/glossary/suggestions", { conversation_id: conversationId, message_id: m.id, word, meaning: meaning || null }); }} />;
    }
    const tid = plan.taskOf(m);
    const live = tid !== null && plan.lastBig[tid] === i;
    if (s.gone[c.id]) return null; // deleted task or check: nothing to draw
    if (c.event === "board") return null; // ping only: the board above refetches itself
    if (c.event === "brief") return null; // ping only: the briefing roll call refetches itself
    if (c.kind === "BRIEF") {
      if (plan.lastBriefCopy[c.id] !== i) return null;
      const b = s.briefings[c.id];
      if (!b) return loading(() => s.refreshBriefing(c.id));
      return isCrew ? <BriefingRollCard b={b} isSup={isSup} t={t} />
        : <BriefingCard b={b} conversationId={conversationId} me={me!} t={t} onBriefing={s.putBriefing} />;
    }
    if (c.kind === "BOARD") {
      const b = s.boards[c.id];
      return b ? <BoardCard b={b} isSup={isSup} t={t} /> : loading(() => s.refreshBoard(c.id));
    }
    if (c.kind === "TASK") {
      const task = tasks[c.id];
      if (!task) return loading(() => s.refreshTask(c.id));
      return <TaskCard task={task} live={live} t={t} lang={me!.language} showSeen={me!.id !== task.worker.id}>{restateFor(task, live)}</TaskCard>;
    }
    if (c.kind === "CHECK") {
      if (plan.lastCheckCopy[c.id] !== i) return null;
      const check = checks[c.id];
      const task = check && tasks[check.task_id];
      if (!check || !task) return loading(() => s.refreshCheck(c.id));
      return (
        <CheckCard check={check} task={task} me={me!} live={live} t={t} myLang={me!.language}
          otherLang={other?.language ?? me!.language} onTask={onTask} onFocusRestate={() => focusRestate(task.id)}>
          {restateFor(task, live)}
        </CheckCard>
      );
    }
    const task = tasks[c.id];
    if (c.event === "seen") return null; // silent ping: the task card above refetches and shows "Seen"
    if (!task) return c.event === "checking" || c.event === "confirmed" ? null : loading(() => s.refreshTask(c.id));
    switch (c.event) {
      case "checking":
        return (plan.lastBig[c.id] ?? -1) < i ? <StateLine><span className="dots">{t("c.checkingLine", { worker: task.worker.name })}</span></StateLine> : null;
      case "confirmed": {
        if (task.state === "understood" || task.state === "done") return null;   // the Understood card says it all
        const who = task.confirmations[plan.confirmIdx[m.id] ?? 0];
        const name = who ? (who.profile_id === task.supervisor.id ? task.supervisor.name : task.worker.name) : null;
        const waiting = who?.profile_id === task.supervisor.id ? task.worker.name : task.supervisor.name;
        const both = (plan.confirmIdx[m.id] ?? 0) >= 1;
        return <StateLine tone="ok">{!name ? t("c.confirmedGeneric") : both ? t("c.confirmedOnly", { name }) : t("c.confirmedLine", { name, other: waiting })}</StateLine>;
      }
      case "understood": return <UnderstoodCard task={task} me={me!} live={live} t={t} onTask={onTask} />;
      case "done": return <DoneCard task={task} live={live} t={t} isSup={me!.id === task.supervisor.id} />;
      case "nudge": return <NudgeLine task={task} me={me!} at={m.at} t={t} onGo={() => focusRestate(task.id)} />;
      default: return null;
    }
  }

  const empty = s.historyReady && msgs.length === 0 && s.pending.length === 0;
  return (
    <Shell title={isCrew ? conv?.conversation.title : other?.display_name} back="/inbox">
      {/* who I'm talking to, and whether the line is live */}
      <div className="border-b-2 border-ink/20 bg-paper">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
          {isCrew && <SiteWordsLink t={t} lang={me.language} />}
          {isCrew && conv ? <CrewSummary members={Object.values(conv.members)} t={t} />
            : other && <span className="font-hand text-lg leading-tight">{t("c.readsIn", { name: other.display_name, lang: LANG_NAME[other.language] })}</span>}
          <LinkChip status={s.status} t={t} />
          {isCrew && isSup && <BriefingEntry href={`/c/${conversationId}/briefing/new`} t={t} />}
          {s.kind === "local" && <span className="text-xs text-muted">{t("c.localTransport")}</span>}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-3 pb-4 pt-3 sm:px-4" aria-live="polite" aria-relevant="additions">
        {!s.historyReady && <div className="py-6 text-center"><Spinner label={t("c.loadingHistory")} /></div>}
        {empty && (
          <div className="pop mx-auto mt-6 flex max-w-sm flex-col items-center text-center">
            <HelloDoodle />
            <p className="mt-3 font-display text-2xl font-extrabold leading-tight">{t(isCrew ? "x.empty.title" : "c.empty.title")}</p>
            <p className="mt-1 text-base text-muted">{t(isCrew ? "x.empty.body" : "c.empty.body")}</p>
            {isSup && <p className="mt-3 font-hand text-xl leading-tight text-pen">{t(isCrew ? "x.empty.task" : "c.empty.task")}</p>}
          </div>
        )}
        {/* the list is drawn once history and its cards' data are in (messages the SDK replays on connect wait too) */}
        {s.historyReady && msgs.map((m, i) => <div key={m.id} data-mid={m.id}>{renderMsg(m, i)}</div>)}
        {s.pending.map((p) => (
          <Bubble key={p.tempId} mine text={p.text} t={t} failed={p.state === "failed"} waiting={p.state === "queued"} onRetry={() => s.retrySend(p)}>
            {p.state === "sending" && <div className="text-right font-hand text-base text-muted"><span className="dots">{t("c.sending")}</span></div>}
            {p.state === "queued" && <div role="status" className="text-right font-hand text-base leading-tight text-muted">{t("c.queued")}</div>}
          </Bubble>
        ))}
      </div>

      {chip && (
        <div className="pointer-events-none sticky bottom-24 z-10 flex justify-center">
          <button type="button" onClick={() => { toBottom(); setChip(false); }}
            className="doodle pointer-events-auto min-h-12 px-4 font-display font-extrabold" style={{ background: "var(--hi)" }}>
            {t("c.newMessages")} ↓
          </button>
        </div>
      )}

      <Composer t={t} lang={me.language} offline={s.status === "offline"} taskHref={isSup && conv ? `/c/${conversationId}/task/new` : undefined}
        taskLabel={isCrew ? t("x.crewTask") : undefined} members={mentionable}
        onSend={(text, mentions) => { atBottom.current = true; s.send(text, mentions); }} />
    </Shell>
  );
}

function Shell({ title, back, children }: { title?: string; back?: string; children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col"><AppHeader title={title} back={back} />{children}</div>;
}

/** Crew channel header line: how many people, and how many read in each language. */
function CrewSummary({ members, t }: { members: { language: (typeof LANGS)[number] }[]; t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 font-hand text-lg leading-tight">
      <span>{t("x.people", { n: members.length })} ·</span>
      {LANGS.map((l) => {
        const n = members.filter((m) => m.language === l).length;
        return n ? <span key={l} className="rounded-full border-2 border-ink/40 px-2 text-base leading-snug">{LANG_NAME[l]} <span className="font-mono">{n}</span></span> : null;
      })}
    </span>
  );
}

function LinkChip({ status, t }: { status: "connecting" | "connected" | "offline"; t: (k: string) => string }) {
  const c = {
    connecting: "border-pen text-pen border-dashed",
    connected: `border-ok ${OK_INK}`,
    offline: "border-bad text-bad bg-bad-soft",
  }[status];
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-sm font-semibold ${c}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill={status === "connected" ? "var(--ok)" : "none"} stroke="currentColor" strokeWidth="2" /></svg>
      {t(`c.link.${status}`)}
    </span>
  );
}
