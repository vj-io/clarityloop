"use client";
/* eslint-disable react-hooks/set-state-in-effect -- these effects only start a fetch on mount; state is set when it resolves */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/session";
import type { TaskDTO } from "@/lib/types";
import { Card, Pill, Screen } from "@/components/ui";
import { HazardIcon } from "@/components/chat/doodles";
import { RemindButton } from "@/components/chat/cards";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRequireMe } from "@/components/shell/guard";
import { ErrorBox, PageLoading, ago, cx, errMsg } from "@/components/shell/Common";
import { TaskStatePill } from "@/components/shell/TaskState";

type Filter = "open" | "overdue" | "understood" | "done";
const OPEN = ["waiting", "checking", "mismatch", "needs_look", "all_match"];
const match = (f: Filter, s: string) => (f === "open" ? OPEN.includes(s) : s === f);
/** Not said back yet and either waiting 15+ minutes or past its time today. Reminders are by hand: the host has no frequent cron. */
const OVERDUE_MS = 15 * 60_000;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
function overdue(k: TaskDTO, now: number) {
  if (k.state !== "waiting") return null;
  const made = new Date(k.created_at), today = new Date(now).toDateString() === made.toDateString();
  const mins = Math.floor((now - made.getTime()) / 60_000);
  const past = today && hm(new Date(now)) > k.due_time && hm(made) <= k.due_time;
  return now - made.getTime() >= OVERDUE_MS || past ? { mins, past } : null;
}
/** One crew task = all its child tasks. Open while any is open; done when all are done; else understood. */
const groupState = (ks: TaskDTO[]) => (ks.some((k) => OPEN.includes(k.state)) ? "waiting" : ks.every((k) => k.state === "done") ? "done" : "understood");
type Entry = { key: string; first: TaskDTO; kids: TaskDTO[] | null };
function entries(tasks: TaskDTO[]): Entry[] {
  const out: Entry[] = [];
  const groups = new Map<string, TaskDTO[]>();
  for (const k of tasks) {
    if (!k.broadcast_id) { out.push({ key: k.id, first: k, kids: null }); continue; }
    const g = groups.get(k.broadcast_id);
    if (g) g.push(k);
    else { const kids = [k]; groups.set(k.broadcast_id, kids); out.push({ key: k.broadcast_id, first: k, kids }); }
  }
  return out;
}

const RecordLink = ({ id, label }: { id: string; label: string }) => (
  <Link href={`/record/${id}`} className="inline-flex min-h-12 shrink-0 items-center px-3 font-semibold text-pen underline decoration-2 underline-offset-4">{label} →</Link>
);

export default function TasksPage() {
  const { me, t } = useRequireMe({ role: "supervisor" });
  const [tasks, setTasks] = useState<TaskDTO[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  const load = useCallback(async () => {
    try {
      const r = await api("GET /api/tasks");
      setTasks([...r.tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setErr(null);
    } catch (e) { setErr(errMsg(e, t)); }
  }, [t]);
  useEffect(() => { if (me) load(); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = tasks ? entries(tasks) : [];
  const stateOf = (e: Entry) => (e.kids ? groupState(e.kids) : e.first.state);
  const shown = all.filter((e) => match(filter, stateOf(e)));
  const late = (tasks ?? []).filter((k) => overdue(k, now));   // one row per worker, crew-task copies included
  const count = (f: Filter) => (f === "overdue" ? late.length : all.filter((e) => match(f, stateOf(e))).length);
  return (
    <>
      <AppHeader title={t("tasks.title")} back="/inbox" />
      <Screen>
        {!me || (!tasks && !err) ? <PageLoading t={t} /> : (
          <>
            <div role="group" aria-label={t("tasks.filter")} className="mb-4 flex flex-wrap gap-2">
              {(["open", "overdue", "understood", "done"] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={cx("min-h-12 rounded-full border-2 border-ink px-4 font-display text-base font-extrabold", filter === f ? "bg-ink text-paper" : f === "overdue" && late.length ? "bg-warn-soft" : "bg-card")}>
                  {t(f === "overdue" ? "g.overdue" : `tasks.f_${f}`)}{tasks && <span className="ml-1 font-mono">{count(f)}</span>}
                </button>
              ))}
            </div>
            {err && <div className="mb-4"><ErrorBox message={err} onRetry={load} t={t} /></div>}
            {filter === "overdue" && tasks && (
              <>
                <p className="mb-3 font-hand text-lg leading-tight text-muted">{t("g.overdueHint")}</p>
                {late.length === 0 ? <Card><p className="text-lg">{t("g.overdueEmpty")}</p></Card> : (
                  <ul className="space-y-3">
                    {late.map((k) => {
                      const o = overdue(k, now)!;
                      return (
                        <li key={k.id} className="doodle p-3">
                          <Link href={`/c/${k.conversation_id}`} className="block min-h-12">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-display text-lg font-extrabold leading-tight">{k.worker.name} · {k.action} · {k.object}</p>
                              <TaskStatePill state={k.state} t={t} />
                            </div>
                            <p className="mt-1 text-base leading-snug">{k.place} · <span className="font-mono">{k.due_time}</span></p>
                            <p className="font-hand text-base text-warn">{t("g.waitingFor", { min: o.mins })}{o.past && <> · {t("g.pastDue", { time: k.due_time })}</>}</p>
                          </Link>
                          <RemindButton task={k} t={t} onTask={(n) => setTasks((l) => l && l.map((x) => (x.id === n.id ? n : x)))} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            {filter !== "overdue" && tasks && shown.length === 0 && <Card><p className="text-lg">{t(tasks.length === 0 ? "tasks.empty" : "tasks.emptyFilter")}</p></Card>}
            <ul className="space-y-3">
              {filter !== "overdue" && shown.map(({ key, first: k, kids }) => kids ? (
                <li key={key}>
                  <details className="doodle group p-0" style={{ background: "var(--card)" }}>
                    <summary className="flex min-h-12 cursor-pointer list-none flex-col gap-1 p-3 [&::-webkit-details-marker]:hidden">
                      <span className="flex flex-wrap items-center gap-1">
                        <Pill tint="hi">{t("x.tasks.group", { n: kids.filter((x) => x.state === "understood" || x.state === "done").length, total: kids.length })}</Pill>
                        {k.is_safety && <Pill tint="bad"><HazardIcon />{t("x.form.safety")}</Pill>}
                        {k.is_sandbox && <Pill tint="warn">{t("c.sandbox")}</Pill>}
                      </span>
                      <span className="font-display text-lg font-extrabold leading-tight">{k.action} · {k.object}</span>
                      <span className="text-base leading-snug">{k.place} · <span className="font-mono">{k.due_time}</span>{k.quantity != null && <> · <span className="font-mono">{k.quantity}</span> {k.unit}</>}</span>
                      <span className="font-hand text-base text-pen underline underline-offset-4">
                        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span> {t("x.tasks.show")} · <span className="text-muted">{ago(k.created_at, t, me.language)}</span>
                      </span>
                    </summary>
                    <ul className="border-t-2 border-dashed border-ink/30">
                      {kids.map((c) => (
                        <li key={c.id} className="flex items-center border-t-2 border-ink/10 first:border-t-0">
                          <Link href={`/c/${c.conversation_id}`} className="flex min-h-12 min-w-0 flex-1 flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <span className="font-display text-base font-extrabold">{c.worker.name}</span>
                            <TaskStatePill state={c.state} t={t} />
                          </Link>
                          <RecordLink id={c.id} label={t("b.in.record")} />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ) : (
                <li key={key}>
                  <Link href={`/c/${k.conversation_id}`} className="doodle block p-3 active:translate-x-[2px] active:translate-y-[2px]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-lg font-extrabold leading-tight">{k.action} · {k.object}</p>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">{k.is_sandbox && <Pill tint="warn">{t("c.sandbox")}</Pill>}<TaskStatePill state={k.state} t={t} /></span>
                    </div>
                    <p className="mt-1 text-base leading-snug">{k.place} · <span className="font-mono">{k.due_time}</span>{k.quantity != null && <> · <span className="font-mono">{k.quantity}</span> {k.unit}</>}</p>
                    <p className="font-hand text-base text-muted">{k.worker.name} · {ago(k.created_at, t, me.language)}</p>
                  </Link>
                  <div className="flex justify-end"><RecordLink id={k.id} label={t("b.in.record")} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Screen>
    </>
  );
}
