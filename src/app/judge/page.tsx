"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the room is read from sessionStorage after mount (not during render, so server and browser markup agree) */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, adoptGrant, markJudgeTab } from "@/lib/client/session";
import type { Role } from "@/lib/types";
import { Card, Pill } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { Btn, CopyButton, ErrorBox, PublicHeader, PublicTitle, errMsg } from "@/components/shell/Common";
import type { T } from "@/lib/i18n";

type Who = "supervisor" | "worker" | "lakshmi";
type Line = { who: "ravi" | "murugan" | "lakshmi"; text: string; tag?: string };
type Step = { k: string; fields?: [string, string][]; note?: string; lines?: Line[]; after?: string };

const NEXCONN_KEY = "qd46yzrfq1obf";
const ROOM_KEY = "cl_judge_room";
const WHO_KEY = { ravi: "judge.who_ravi", murugan: "judge.who_murugan", lakshmi: "x.judge.who_lakshmi" } as const;

const PAIR_TASK: [string, string][] = [["c.f.action", "Unload"], ["b.f.object", "cement bags"], ["c.f.place", "Gate 3"], ["b.f.time", "14:00"], ["c.form.qty", "40"], ["c.form.unit", "bags"]];
const CREW_TASK: [string, string][] = [["c.f.action", "Move"], ["b.f.object", "steel rods"], ["c.f.place", "Gate 1"], ["b.f.time", "09:30"], ["c.form.qty", "20"], ["c.form.unit", "rods"], ["x.form.safety", "j.on"]];

const STEPS: Step[] = [
  { k: "j.s1", lines: [{ who: "ravi", text: "Morning! Cement truck arrives at 1." }, { who: "murugan", text: "Theek hai sir, kahan utaarna hai?" }] },
  { k: "j.s2", fields: PAIR_TASK, note: "j.unit" },
  { k: "j.s3", lines: [{ who: "murugan", text: "40 bori cement Gate 2 pe utaarna hai, 2 baje tak." }] },
  { k: "j.s4", lines: [{ who: "ravi", text: "Gate 3, near the water tank." }, { who: "murugan", text: "40 bori cement Gate 3 pe utaarna hai, 2 baje tak." }] },
  { k: "j.s5", fields: CREW_TASK },
  {
    k: "j.s6", after: "j.s6x",
    lines: [
      { who: "murugan", tag: "j.tagWrong", text: "Gate 1 pe 20 steel rods shaam 9:30 baje le jaane hain." },
      { who: "murugan", tag: "j.tagRight", text: "Gate 1 pe 20 steel rods subah 9:30 baje le jaane hain." },
      { who: "lakshmi", tag: "j.tagRight", text: "காலை 9:30 மணிக்கு கேட் 1-க்கு 20 ஸ்டீல் கம்பிகளை நகர்த்த வேண்டும்." },
    ],
  },
  {
    k: "j.s8", after: "j.s8x",
    lines: [
      { who: "murugan", tag: "j.tagTwo", text: "Helmet pehenna hai aur chadhne se pehle scaffolding ka tag dekhna hai" },
      { who: "murugan", tag: "j.tagThird", text: "Do meter se upar kaam karte waqt safety belt bhi lagaunga" },
    ],
  },
  { k: "j.s7" },
];

const roomUrl = (as: Who, room: number | null) => `/judge?as=${as}${room == null ? "" : `&room=${room}`}`;

function Enter({ as, room, t }: { as: Who; room: number | null; t: T }) {
  const role: Role = as === "supervisor" ? "supervisor" : "worker";
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
        // `worker` only for Lakshmi and `room` only when the chooser gave one: without them the request is the original one
        const body = { role, ...(as === "lakshmi" ? { worker: "lakshmi" as const } : {}), ...(room == null ? {} : { room }) };
        const grant = await api("POST /api/judge", body); // the Api type gains `room?` in src/lib/types.ts; extra field is harmless before that
        await adoptGrant(grant);
        router.replace(`/c/${grant.conversation_id}`);
      } catch (e) { setErr(errMsg(e, t)); }
    })();
  }, [tick, role, as, room, router, t]);
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      {err ? (
        <>
          <ErrorBox message={err} onRetry={() => setTick((n) => n + 1)} t={t} />
          <p className="mt-4"><Link href="/judge" className="inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4">{t("judge.back")}</Link></p>
        </>
      ) : (
        <p role="status" className="text-center font-hand text-2xl"><span className="dots">{t(as === "supervisor" ? "judge.enteringS" : as === "lakshmi" ? "x.judge.enteringL" : "judge.enteringW")}</span></p>
      )}
    </div>
  );
}

function Chooser({ t }: { t: T }) {
  const [blocked, setBlocked] = useState(false);
  const [room, setRoom] = useState<number | null>(null);
  const [getting, setGetting] = useState(false);
  const pending = useRef<Promise<number | null> | null>(null);

  useEffect(() => {
    try { const v = sessionStorage.getItem(ROOM_KEY); if (v && /^\d+$/.test(v)) setRoom(Number(v)); } catch { /* no storage: the room lives until reload */ }
  }, []);

  /** One POST per chooser page load (cached here and in sessionStorage); null when the API is unavailable = old behaviour, no room. */
  const getRoom = useCallback((): Promise<number | null> => {
    if (!pending.current) {
      pending.current = (async () => {
        try { const v = sessionStorage.getItem(ROOM_KEY); if (v && /^\d+$/.test(v)) return Number(v); } catch { /* fall through to the API */ }
        setGetting(true);
        try {
          const r = await fetch("/api/judge/room", { method: "POST" });
          const j = (await r.json()) as { room?: unknown };
          if (!r.ok || typeof j.room !== "number") return null;
          try { sessionStorage.setItem(ROOM_KEY, String(j.room)); } catch { /* ignore */ }
          return j.room;
        } catch { return null; } finally { setGetting(false); }
      })().then((n) => { if (n == null) pending.current = null; setRoom(n); return n; });
    }
    return pending.current;
  }, []);
  // Ask for the room while the judge is still reading, so "Open" does not wait for it.
  useEffect(() => { void getRoom(); }, [getRoom]);

  function fresh() {
    try { sessionStorage.removeItem(ROOM_KEY); } catch { /* ignore */ }
    pending.current = null;
    setRoom(null);
    void getRoom();
  }

  /** Windows open at once, inside the click (pop-up blockers), and are pointed at their account when the room is known. */
  async function open(list: { as: Who; feat?: string }[]) {
    const wins = list.map((x) => window.open("about:blank", `cl_${x.as}`, x.feat));
    setBlocked(wins.some((w) => !w));
    const n = await getRoom();
    wins.forEach((w, i) => { if (w) w.location.href = roomUrl(list[i].as, n); });
  }
  function all() {
    const aw = screen.availWidth, h = screen.availHeight, pw = Math.min(420, Math.floor(aw / 4)), lw = aw - 2 * pw;
    void open([
      { as: "supervisor", feat: `popup=yes,left=0,top=0,width=${lw},height=${h}` },
      { as: "worker", feat: `popup=yes,left=${lw},top=0,width=${pw},height=${h}` },
      { as: "lakshmi", feat: `popup=yes,left=${lw + pw},top=0,width=${pw},height=${h}` },
    ]);
  }

  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <PublicTitle>{`${t("judge.title")} · ClarityLoop`}</PublicTitle>
      <Pill tint="warn">{t("judge.sandbox")}</Pill>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight">{t("judge.title")}</h1>
      <ol className="mt-3 list-none space-y-2 text-lg leading-snug">
        {["judge.l1", "judge.l2", "judge.l3"].map((k, i) => (
          <li key={k} className="flex gap-2"><span className="font-mono font-bold">{i + 1}</span><span>{t(k)}</span></li>
        ))}
      </ol>
      <p className="mt-3 text-base leading-snug">{t("j.nexconn")} <code className="font-mono font-bold">{NEXCONN_KEY}</code></p>

      <div className="mt-5 flex flex-col gap-3">
        <Btn tone="hi" type="button" onClick={all} className="min-h-14 text-lg">{t("judge.both")}</Btn>
        <Btn tone="ink" type="button" onClick={() => void open([{ as: "supervisor" }])}>{t("judge.openRavi")}</Btn>
        <Btn tone="pen" type="button" onClick={() => void open([{ as: "worker" }])}>{t("judge.openMurugan")}</Btn>
        <Btn tone="ghost" type="button" onClick={() => void open([{ as: "lakshmi" }])}>{t("x.judge.openLakshmi")}</Btn>
        {blocked && <p role="alert" className="font-semibold text-bad">{t("judge.blocked")}</p>}
        <p role="status" className="font-hand text-lg leading-snug">
          {getting ? <span className="dots">{t("j.getting")}</span> : room != null && <>{t("j.room", { n: room })}</>}
        </p>
        {(room != null || getting) && <button type="button" onClick={fresh} disabled={getting} className="inline-flex min-h-12 items-center self-start font-semibold text-pen underline underline-offset-4">{t("j.fresh")}</button>}
      </div>

      <h2 className="mt-10 font-display text-2xl font-extrabold">{t("judge.scriptTitle")}</h2>
      <p className="font-hand text-lg text-muted">{t("judge.scriptSub")}</p>
      <ol className="mt-3 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.k}>
            <Card className={i % 2 ? "rotate-[0.4deg]" : "-rotate-[0.4deg]"}>
              <p className="font-display text-lg font-extrabold leading-tight"><span className="font-mono">{i + 1}</span> · {t(s.k)}</p>
              <p className="mt-1 leading-snug text-muted">{t(`${s.k}b`)}</p>
              {s.fields && (
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
                  {s.fields.map(([lk, v]) => (
                    <div key={lk} className="contents"><dt className="font-hand text-base text-muted">{t(lk)}</dt><dd className="font-mono text-[0.95rem] font-bold">{v.startsWith("j.") ? t(v) : v}</dd></div>
                  ))}
                </dl>
              )}
              {s.note && <p className="mt-2 text-base leading-snug">{t(s.note)}</p>}
              {s.lines && (
                <ul className="mt-3 space-y-2">
                  {s.lines.map((l) => (
                    <li key={l.text} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-hand text-base text-muted">{t(WHO_KEY[l.who])}{l.tag && <> · {t(l.tag)}</>}</p>
                        <p lang={l.who === "lakshmi" ? "ta" : undefined} className="break-words rounded-lg border-2 border-ink bg-pen-soft px-2 py-1 font-mono text-[0.95rem] leading-snug">{l.text}</p>
                      </div>
                      <CopyButton text={l.text} t={t} />
                    </li>
                  ))}
                </ul>
              )}
              {s.after && <p className="mt-3 text-base leading-snug">{t(s.after)}</p>}
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
  const q = useSearchParams();
  const as = q.get("as");
  const r = q.get("room");
  const room = r && /^\d+$/.test(r) ? Number(r) : null;
  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      {as === "supervisor" || as === "worker" || as === "lakshmi" ? <Enter as={as} room={room} t={t} /> : <Chooser t={t} />}
    </>
  );
}

export default function JudgePage() {
  return <Suspense><Inner /></Suspense>;
}
