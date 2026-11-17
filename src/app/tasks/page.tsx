"use client";
/* eslint-disable react-hooks/set-state-in-effect -- these effects only start a fetch on mount; state is set when it resolves */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/session";
import type { TaskDTO } from "@/lib/types";
import { Card, Screen } from "@/components/ui";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRequireMe } from "@/components/shell/guard";
import { ErrorBox, PageLoading, ago, cx, errMsg } from "@/components/shell/Common";
import { TaskStatePill } from "@/components/shell/TaskState";

type Filter = "open" | "understood" | "done";
const OPEN = ["waiting", "checking", "mismatch", "needs_look", "all_match"];
const match = (f: Filter, s: string) => (f === "open" ? OPEN.includes(s) : s === f);

export default function TasksPage() {
  const { me, t } = useRequireMe({ role: "supervisor" });
  const [tasks, setTasks] = useState<TaskDTO[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");

  const load = useCallback(async () => {
    try {
      const r = await api("GET /api/tasks");
      setTasks([...r.tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setErr(null);
    } catch (e) { setErr(errMsg(e, t)); }
  }, [t]);
  useEffect(() => { if (me) load(); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = tasks?.filter((x) => match(filter, x.state)) ?? [];
  return (
    <>
      <AppHeader title={t("tasks.title")} back="/inbox" />
      <Screen>
        {!me || (!tasks && !err) ? <PageLoading t={t} /> : (
          <>
            <div role="group" aria-label={t("tasks.filter")} className="mb-4 flex flex-wrap gap-2">
              {(["open", "understood", "done"] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={cx("min-h-12 rounded-full border-2 border-ink px-4 font-display text-base font-extrabold", filter === f ? "bg-ink text-paper" : "bg-card")}>
                  {t(`tasks.f_${f}`)}{tasks && <span className="ml-1 font-mono">{tasks.filter((x) => match(f, x.state)).length}</span>}
                </button>
              ))}
            </div>
            {err && <div className="mb-4"><ErrorBox message={err} onRetry={load} t={t} /></div>}
            {tasks && shown.length === 0 && <Card><p className="text-lg">{t(tasks.length === 0 ? "tasks.empty" : "tasks.emptyFilter")}</p></Card>}
            <ul className="space-y-3">
              {shown.map((k) => (
                <li key={k.id}>
                  <Link href={`/c/${k.conversation_id}`} className="doodle block p-3 active:translate-x-[2px] active:translate-y-[2px]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-lg font-extrabold leading-tight">{k.action} · {k.object}</p>
                      <TaskStatePill state={k.state} t={t} />
                    </div>
                    <p className="mt-1 text-base leading-snug">{k.place} · <span className="font-mono">{k.due_time}</span>{k.quantity != null && <> · <span className="font-mono">{k.quantity}</span> {k.unit}</>}</p>
                    <p className="font-hand text-base text-muted">{k.worker.name} · {ago(k.created_at, t, me.language)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Screen>
    </>
  );
}
