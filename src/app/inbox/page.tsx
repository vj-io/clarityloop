"use client";
/* eslint-disable react-hooks/set-state-in-effect -- these effects only start a fetch on mount; state is set when it resolves */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/session";
import { LANG_NAME, type ConversationDTO } from "@/lib/types";
import { Card, Pill, Screen } from "@/components/ui";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRequireMe } from "@/components/shell/guard";
import { Btn, ErrorBox, LinkButton, PageLoading, ago, errMsg } from "@/components/shell/Common";
import { CrewDoodle } from "@/components/chat/board";
import { Stick } from "@/components/shell/Figures";

export default function InboxPage() {
  const { me, t } = useRequireMe();
  const [list, setList] = useState<ConversationDTO[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api("GET /api/conversations");
      // the crew channel first, then newest activity
      setList([...r.conversations].sort((a, b) => Number(b.kind === "crew") - Number(a.kind === "crew") || b.last_activity_at.localeCompare(a.last_activity_at)));
      setErr(null);
    } catch (e) { setErr(errMsg(e, t)); }
  }, [t]);

  useEffect(() => {
    if (!me) return;
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10_000);
    return () => clearInterval(id);
  }, [me?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const router = useRouter();
  const [opening, setOpening] = useState(false);
  async function openCrew() {
    setOpening(true);
    try { router.push(`/c/${(await api("POST /api/conversations/crew")).conversation.id}`); }
    catch (e) { setErr(errMsg(e, t)); setOpening(false); }
  }
  const hasCrewChat = list?.some((c) => c.kind === "crew");

  return (
    <>
      <AppHeader title={t("inbox.title")} />
      <Screen>
        {!me || (!list && !err) ? <PageLoading t={t} /> : (
          <>
            {err && <div className="mb-4"><ErrorBox message={err} onRetry={load} t={t} /></div>}
            {list && list.length === 0 && (
              <Card className="flex flex-col items-start gap-3">
                <Stick hat size={56} />
                <p className="font-display text-xl font-extrabold leading-tight">{t(me.role === "worker" ? "inbox.emptyW" : "inbox.emptyS")}</p>
                <p className="text-lg leading-snug">{t(me.role === "worker" ? "inbox.emptyWb" : "inbox.emptySb")}</p>
                {me.role === "supervisor" && <LinkButton href="/crew" tone="hi">{t("inbox.toCrew")}</LinkButton>}
              </Card>
            )}
            {me.role === "supervisor" && me.crew_id && list && list.length > 0 && !hasCrewChat && (
              <div className="doodle mb-4 flex flex-wrap items-center gap-3 p-3" style={{ borderStyle: "dashed" }}>
                <CrewDoodle size={36} />
                <p className="min-w-0 flex-1 text-base leading-snug">{t("x.crewChatHint")}</p>
                <Btn tone="hi" disabled={opening} onClick={openCrew}>{t("x.openCrewChat")}</Btn>
              </div>
            )}
            <ul className="space-y-3">
              {list?.map((c) => c.kind === "crew" ? (
                <li key={c.id}>
                  <Link href={`/c/${c.id}`} className="doodle flex min-h-16 items-center gap-3 p-3 active:translate-x-[2px] active:translate-y-[2px]" style={{ background: "var(--hi)" }}>
                    <CrewDoodle size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-extrabold">{t("x.crewChat")} · {c.title}</p>
                      <p className="flex flex-wrap items-center gap-1 text-base">
                        <Pill>{t("x.people", { n: c.member_count ?? 0 })}</Pill>
                        <span className="font-hand text-base">{t("x.eachOwnLang")}</span>
                        <span className="font-hand text-base text-muted">· {ago(c.last_activity_at, t, me.language)}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ) : (
                <li key={c.id}>
                  <Link href={`/c/${c.id}`} className="doodle flex min-h-16 items-center justify-between gap-3 p-3 active:translate-x-[2px] active:translate-y-[2px]">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-extrabold">{c.other.display_name}</p>
                      <p className="flex flex-wrap items-center gap-1 text-base">
                        <Pill>{t(`role.${c.other.role}`)}</Pill><Pill tint="pen">{LANG_NAME[c.other.language]}</Pill>
                        <span className="font-hand text-base text-muted">{ago(c.last_activity_at, t, me.language)}</span>
                      </p>
                    </div>
                    {c.open_tasks > 0 && <Pill tint="warn">{t("inbox.open", { n: c.open_tasks })}</Pill>}
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
