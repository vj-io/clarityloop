"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, adoptGrant, markJudgeTab } from "@/lib/client/session";
import type { Role } from "@/lib/types";
import { Card, Pill } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { Btn, CopyButton, ErrorBox, LinkButton, PublicHeader, errMsg } from "@/components/shell/Common";
import type { T } from "@/lib/i18n";

const SCRIPT: { who: "ravi" | "murugan"; lines: string[] }[] = [
  { who: "ravi", lines: ["Morning! Cement truck arrives at 1."] },
  { who: "murugan", lines: ["Theek hai sir, kahan utaarna hai?"] },
  { who: "ravi", lines: ["cement bags"] },
  { who: "murugan", lines: ["40 bori cement Gate 2 pe utaarna hai, 2 baje tak."] },
  { who: "ravi", lines: ["Gate 3, near the water tank."] },
  { who: "murugan", lines: ["40 bori cement Gate 3 pe utaarna hai, 2 baje tak."] },
];
// Steps map onto SCRIPT lines by index.
const STEPS: { k: string; lines: number[] }[] = [
  { k: "judge.st1", lines: [0, 1] },
  { k: "judge.st2", lines: [2] },
  { k: "judge.st3", lines: [3] },
  { k: "judge.st4", lines: [4, 5] },
];

function Enter({ role, t }: { role: Role; t: T }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const started = useRef(-1);
  useEffect(() => {
    if (started.current === tick) return; // StrictMode runs effects twice
    started.current = tick;
    setErr(null);
    markJudgeTab(); // before any supabase() use: this tab keeps its own session
    (async () => {
      try {
        const grant = await api("POST /api/judge", { role });
        await adoptGrant(grant);
        router.replace(`/c/${grant.conversation_id}`);
      } catch (e) { setErr(errMsg(e, t)); }
    })();
  }, [tick, role, router, t]);
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      {err ? (
        <>
          <ErrorBox message={err} onRetry={() => setTick((n) => n + 1)} t={t} />
          <p className="mt-4"><Link href="/judge" className="inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4">{t("judge.back")}</Link></p>
        </>
      ) : (
        <p role="status" className="text-center font-hand text-2xl"><span className="dots">{t(role === "supervisor" ? "judge.enteringS" : "judge.enteringW")}</span></p>
      )}
    </div>
  );
}

function Chooser({ t }: { t: T }) {
  const [blocked, setBlocked] = useState(false);
  function both() {
    const w = Math.floor(screen.availWidth / 2), h = screen.availHeight;
    const a = window.open("/judge?as=supervisor", "cl_ravi", `popup=yes,left=0,top=0,width=${w},height=${h}`);
    const b = window.open("/judge?as=worker", "cl_murugan", `popup=yes,left=${w},top=0,width=${w},height=${h}`);
    setBlocked(!a || !b);
  }
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Pill tint="warn">{t("judge.sandbox")}</Pill>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight">{t("judge.title")}</h1>
      <ol className="mt-3 list-none space-y-2 text-lg leading-snug">
        {["judge.l1", "judge.l2", "judge.l3"].map((k, i) => (
          <li key={k} className="flex gap-2"><span className="font-mono font-bold">{i + 1}</span><span>{t(k)}</span></li>
        ))}
      </ol>

      <div className="mt-5 flex flex-col gap-4">
        <LinkButton href="/judge?as=supervisor" target="_blank" rel="noopener" tone="hi" className="min-h-14 text-lg">{t("judge.openRavi")}</LinkButton>
        <LinkButton href="/judge?as=worker" target="_blank" rel="noopener" tone="pen" className="min-h-14 text-lg">{t("judge.openMurugan")}</LinkButton>
        <Btn tone="ghost" type="button" onClick={both}>{t("judge.both")}</Btn>
        {blocked && <p role="alert" className="font-semibold text-bad">{t("judge.blocked")}</p>}
      </div>

      <h2 className="mt-10 font-display text-2xl font-extrabold">{t("judge.scriptTitle")}</h2>
      <p className="font-hand text-lg text-muted">{t("judge.scriptSub")}</p>
      <ol className="mt-3 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.k}>
            <Card className={i % 2 ? "rotate-[0.4deg]" : "-rotate-[0.4deg]"}>
              <p className="font-display text-lg font-extrabold leading-tight"><span className="font-mono">{i + 1}</span> · {t(s.k)}</p>
              <p className="mt-1 leading-snug text-muted">{t(`${s.k}b`)}</p>
              <ul className="mt-3 space-y-2">
                {s.lines.map((li) => {
                  const l = SCRIPT[li];
                  return (
                    <li key={li} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-hand text-base text-muted">{t(`judge.who_${l.who}`)}</p>
                        <p className="break-words rounded-lg border-2 border-ink bg-pen-soft px-2 py-1 font-mono text-[0.95rem] leading-snug">{l.lines[0]}</p>
                      </div>
                      <CopyButton text={l.lines[0]} t={t} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </li>
        ))}
      </ol>
      <p className="mt-6 font-hand text-lg">{t("judge.note")}</p>
      <p className="mt-2"><Link href="/" className="inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4">{t("judge.home")}</Link></p>
    </main>
  );
}

function Inner() {
  const { lang, setLang, t } = usePublicLang();
  const as = useSearchParams().get("as");
  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      {as === "supervisor" || as === "worker" ? <Enter role={as} t={t} /> : <Chooser t={t} />}
    </>
  );
}

export default function JudgePage() {
  return <Suspense><Inner /></Suspense>;
}
