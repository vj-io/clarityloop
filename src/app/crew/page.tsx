"use client";
/* eslint-disable react-hooks/set-state-in-effect -- these effects only start a fetch on mount; state is set when it resolves */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/client/session";
import { LANGS, LANG_NAME, type CrewDTO, type ListItem } from "@/lib/types";
import { Arrow, Card, Field, Input, Pill, Screen } from "@/components/ui";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRequireMe } from "@/components/shell/guard";
import { Btn, CopyButton, ErrorBox, PageLoading, errMsg } from "@/components/shell/Common";
import type { T } from "@/lib/i18n";
import { CrewDoodle } from "@/components/chat/board";
import { HazardIcon } from "@/components/chat/doodles";
import { SiteWords } from "@/components/chat/terms";

function ListEditor({ kind, items, t, onCrew }: { kind: "place" | "action" | "safety"; items: ListItem[]; t: T; onCrew: (c: CrewDTO) => void }) {
  const safety = kind === "safety";
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { onCrew((await api("POST /api/crew/lists", { kind, label: label.trim() })).crew); setLabel(""); }
    catch (x) { setErr(errMsg(x, t)); }
    setBusy(false);
  }
  async function del(id: string) {
    setErr(null);
    try { onCrew((await api("DELETE /api/crew/lists", { kind, id })).crew); }
    catch (x) { setErr(x instanceof ApiError && x.status === 409 ? t("crew.inUse") : errMsg(x, t)); }
  }
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">{safety && <HazardIcon size={22} />}{t(safety ? "s.list.title" : `crew.${kind}s`)}</h2>
      <p className="font-hand text-base text-muted">{t(safety ? "s.list.hint" : "crew.listHint")}</p>
      <ul className="mt-2 divide-y-2 divide-dashed divide-ink/30">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-2 py-1">
            <span className="min-w-0">
              <span className="block font-semibold leading-tight">{it.label}</span>
              <span className="block break-words text-sm leading-tight text-muted">{LANGS.map((l) => it.labels[l]).join(" · ")}</span>
            </span>
            <button type="button" onClick={() => del(it.id)} aria-label={`${t("crew.remove")}: ${it.label}`}
              className="inline-flex min-h-12 shrink-0 items-center gap-1 px-2 font-semibold text-bad underline underline-offset-4">
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 6 L26 26 M26 6 L6 26" stroke="var(--bad)" strokeWidth={5} strokeLinecap="round" /></svg>
              {t("crew.remove")}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t(safety ? "s.list.add" : `crew.add_${kind}`)} error={err}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={safety ? 80 : 40} />
          </Field>
        </div>
        <Btn type="submit" disabled={busy || !label.trim()} className="shrink-0">{t("crew.add")}</Btn>
      </form>
    </Card>
  );
}

export default function CrewPage() {
  const { me, t } = useRequireMe({ role: "supervisor" });
  const router = useRouter();
  const [crew, setCrew] = useState<CrewDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setCrew((await api("GET /api/crew")).crew); } catch (e) { setErr(errMsg(e, t)); }
  }, [t]);
  useEffect(() => { if (me) load(); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function chat(workerId: string) {
    setChatBusy(workerId); setErr(null);
    try { router.push(`/c/${(await api("POST /api/conversations", { worker_id: workerId })).conversation.id}`); }
    catch (e) { setErr(errMsg(e, t)); setChatBusy(null); }
  }
  async function crewChat() {
    setChatBusy("crew"); setErr(null);
    try { router.push(`/c/${(await api("POST /api/conversations/crew")).conversation.id}`); }
    catch (e) { setErr(errMsg(e, t)); setChatBusy(null); }
  }
  const workers = crew?.members.filter((m) => m.role === "worker") ?? [];
  const link = typeof window === "undefined" || !crew ? "" : `${location.origin}/join?code=${crew.join_code}`;

  return (
    <>
      <AppHeader title={t("crew.title")} back="/inbox" />
      <Screen>
        {!me || (!crew && !err) ? <PageLoading t={t} /> : err && !crew ? <ErrorBox message={err} onRetry={load} t={t} /> : crew && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl font-extrabold leading-tight">{crew.name}</h2>
              <p className="font-hand text-lg text-muted">{t("crew.site")}: {crew.site_name}</p>
            </div>

            <div className="doodle flex flex-wrap items-center gap-3 p-3">
              <CrewDoodle size={40} />
              <p className="min-w-0 flex-1 text-base leading-snug">{t("x.crewChatHint")}</p>
              <Btn tone="hi" className="w-full sm:w-auto" disabled={chatBusy === "crew"} onClick={crewChat}>{t("x.openCrewChat")}</Btn>
            </div>

            <Card className="-rotate-[0.6deg] bg-hi!">
              <p className="font-hand text-lg">{t("crew.codeTitle")}</p>
              <p className="break-all font-mono text-4xl font-bold tracking-[0.2em]" aria-label={crew.join_code.split("").join(" ")}>{crew.join_code}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={crew.join_code} t={t} label={t("crew.copyCode")} />
                <CopyButton text={link} t={t} label={t("crew.copyLink")} />
              </div>
              <p className="mt-2 break-all font-mono text-sm">{link}</p>
            </Card>

            {err && <ErrorBox message={err} t={t} />}

            <section>
              <h2 className="mb-2 font-display text-xl font-extrabold">{t("crew.members")}</h2>
              {workers.length === 0 ? (
                <Card className="flex items-center gap-3">
                  <Arrow className="h-8 w-16 shrink-0 -rotate-90" />
                  <p className="text-lg leading-snug">{t("crew.empty")}</p>
                </Card>
              ) : (
                <ul className="space-y-3">
                  {workers.map((m) => (
                    <li key={m.id} className="doodle flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-extrabold">{m.display_name}</p>
                        <p className="flex flex-wrap items-center gap-1 text-base"><Pill>{t("role.worker")}</Pill><Pill tint="pen">{LANG_NAME[m.language]}</Pill></p>
                      </div>
                      <Btn tone="pen" disabled={chatBusy === m.id} onClick={() => chat(m.id)}>{t("crew.chat")}</Btn>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <ListEditor kind="place" items={crew.places} t={t} onCrew={setCrew} />
            <ListEditor kind="action" items={crew.actions} t={t} onCrew={setCrew} />
            <ListEditor kind="safety" items={crew.safety_points ?? []} t={t} onCrew={setCrew} />
            <SiteWords t={t} lang={me.language} />
          </div>
        )}
      </Screen>
    </>
  );
}
