"use client";
// Safety briefing check: the send sheet, the worker's briefing card (pair chat) and the roll call (crew channel).
// Every mark is icon + word + colour. Workers see other workers only as "understood" / "not yet" (the server
// redacts; this only draws). Wording never claims the site is safe: it is an extra check of understanding.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client/session";
import { makeT, type T } from "@/lib/i18n";
import { MAX_POINTS, MIN_POINTS, PRESETS, presetPick } from "@/lib/briefing";
import { inLang, LANG_NAME, LANGS, type BriefingDTO, type BriefingReplyDTO, type BriefingRow, type CrewDTO, type Lang, type Me } from "@/lib/types";
import { Button, MarkIcon, Pill } from "@/components/ui";
import { BigCheck, HazardIcon } from "./doodles";
import { hhmm } from "./Bubble";
import { MicButton, MicStatus, SpeakButton, useMic } from "./voice";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
const OK_INK = "text-[#0f6b31]";   // --ok darkened: 4.5:1 or better on paper and the soft tints
const P = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const errText = (t: T, e: unknown) =>
  e instanceof ApiError ? (e.status === 429 ? t("c.err.slow") : e.code === "ai_unavailable" ? t("c.err.ai") : t("c.err.generic")) : t("c.err.network");

/** Small round number, hand-drawn. */
function Num({ n, tone = "ink" }: { n: number; tone?: "ink" | "ok" | "bad" }) {
  const c = tone === "ok" ? "border-ok bg-ok-soft" : tone === "bad" ? "border-bad bg-bad-soft" : "border-ink bg-card";
  return <span aria-hidden="true" className={cx("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[2.5px] font-display text-lg font-extrabold", c)}>{n}</span>;
}

/** said / not said yet: icon + word + colour */
function SaidMark({ said, t }: { said: boolean; t: T }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 font-display text-base font-extrabold leading-none", said ? OK_INK : "text-bad")}>
      <MarkIcon mark={said ? "match" : "mismatch"} size={22} />{t(said ? "s.mark.said" : "s.mark.notSaid")}
    </span>
  );
}

function PlaceNote({ b, t }: { b: Pick<BriefingDTO, "place" | "note">; t: T }) {
  if (!b.place && !b.note) return null;
  return (
    <div className="mt-3 space-y-2">
      {b.place && <p className="flex flex-wrap items-baseline gap-x-3"><span className="font-hand text-lg text-muted">{t("s.form.place")}</span><span className="font-display text-xl font-extrabold break-words">{b.place}</span></p>}
      {b.note && <p className="border-l-4 border-hi pl-3 text-base italic break-words">{b.note}</p>}
    </div>
  );
}

/** The points, numbered and big. With `marks`, each one says whether the worker has said it. */
export function PointList({ points, marks, t, big = true }: {
  points: { id: string; label: string }[]; marks?: Set<string> | null; t: T; big?: boolean;
}) {
  return (
    <ol className="mt-3 space-y-2">
      {points.map((p, i) => {
        const said = marks ? marks.has(p.id) : null;
        return (
          <li key={p.id} data-flag={said === false ? "" : undefined}
            className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-2 px-3 py-2",
              said === false ? "border-bad border-l-[6px] bg-bad-soft" : said ? "border-ok/60 bg-ok-soft/60" : "border-ink/20 bg-paper")}>
            <span className="flex min-w-0 flex-1 basis-48 items-center gap-3">
              <Num n={i + 1} tone={said === null ? "ink" : said ? "ok" : "bad"} />
              <span className={cx("min-w-0 break-words font-display font-extrabold leading-tight", big ? "text-xl" : "text-lg")}>{p.label}</span>
            </span>
            {said !== null && <span className="ml-auto"><SaidMark said={said} t={t} /></span>}
          </li>
        );
      })}
    </ol>
  );
}

const pointsSentence = (b: BriefingDTO) => b.points.map((p, i) => `${i + 1}. ${p.label}`).concat(b.place ? [b.place] : [], b.note ? [b.note] : []).join(". ");

// ---------------------------------------------------------------- the worker's card (pair chat)
function SayBackBox({ b, reply, t, lang, onBriefing }: { b: BriefingDTO; reply: BriefingReplyDTO; t: T; lang: Lang; onBriefing: (b: BriefingDTO) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const mic = useMic(lang, text, (s) => setText(s.slice(0, 1000)));
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const missing = b.points.filter((p) => reply.missing.includes(p.id));
  const again = reply.state === "missed";

  async function submit() {
    const v = text.trim();
    if (!v) { setErr(t("s.card.empty")); ref.current?.focus(); return; }
    setBusy(true); setErr(null); setSlow(false);
    const timer = setTimeout(() => setSlow(true), 6000);
    try {
      const r = await api("POST /api/briefings/:id/reply", { text: v }, { id: b.id });
      const mine = r.briefing.replies.find((x) => x.worker.id === reply.worker.id);
      // couldn't check: the words stay in the box to send again
      if (!mine?.attempts.at(-1)?.unreadable) setText("");
      onBriefing(r.briefing);
    } catch (e) {
      setErr(errText(t, e)); // the typed text stays in the box
    } finally { clearTimeout(timer); setBusy(false); setSlow(false); }
  }

  return (
    <div className="mt-4 rounded-2xl border-[2.5px] border-dashed border-pen bg-pen-soft/60 p-3">
      <label htmlFor={`brief-${b.id}`} className="block font-display text-xl font-extrabold leading-tight">
        {again && missing.length ? t("s.card.promptAgain", { points: missing.map((p) => p.label).join(" · ") }) : t("s.card.prompt", { n: b.points.length })}
      </label>
      <p className="font-hand text-lg leading-tight text-pen">{t("c.restate.noOk")} {t("s.card.oneReply")}</p>
      <div className="mt-2 flex items-start gap-2">
        <textarea id={`brief-${b.id}`} ref={ref} value={text} maxLength={1000} rows={3} disabled={busy}
          onChange={(e) => setText(e.target.value)} placeholder={t("s.card.placeholder")}
          className="doodle doodle-flat min-w-0 flex-1 resize-y bg-card px-3 py-2 text-base placeholder:text-muted" />
        <MicButton mic={mic} t={t} disabled={busy} />
      </div>
      <MicStatus mic={mic} t={t} />
      {err && <p role="alert" className="mt-1 text-sm font-semibold text-bad">{err}</p>}
      <Button tone="pen" className="mt-2 w-full" style={{ background: "var(--pen)" }} onClick={submit} disabled={busy}>
        {busy ? <span className="dots">{t("c.restate.checking")}</span> : t("c.restate.submit")}
      </Button>
      {busy && slow && <p role="status" className="mt-1 font-hand text-lg text-muted">{t("c.restate.slow")}</p>}
    </div>
  );
}

export function BriefingCard({ b, conversationId, me, t, onBriefing }: {
  b: BriefingDTO; conversationId: string; me: Me; t: T; onBriefing: (b: BriefingDTO) => void;
}) {
  const reply = b.replies.find((r) => r.conversation_id === conversationId);
  const isWorker = !!reply && reply.worker.id === me.id;
  const isSup = me.id === b.supervisor.id;
  const checked = reply?.attempts.filter((a) => !a.unreadable) ?? [];
  const last = reply?.attempts.at(-1);
  const unreadable = !!last?.unreadable;
  const understood = reply?.state === "understood";
  const marks = reply && checked.length ? new Set(reply.said) : null;
  const tint = understood ? "bg-ok-soft" : unreadable ? "bg-warn-soft" : reply?.state === "missed" ? "bg-bad-soft" : "bg-hi";
  const extras = reply ? b.other_points.filter((p) => reply.extra.includes(p.id)) : [];
  const n = b.points.length;

  return (
    <section className="doodle pop my-4 overflow-hidden p-0" aria-label={t("s.card.label")}>
      <header className={cx("flex flex-wrap items-center gap-2 border-b-[2.5px] border-ink px-4 py-2", tint)}>
        <HazardIcon size={22} />
        <span className="font-hand text-lg leading-none">{t("s.card.label")}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">{b.is_sandbox && <Pill tint="warn">{t("c.sandbox")}</Pill>}</span>
      </header>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{t("s.card.from", { sup: b.supervisor.name, n })} · <span className="font-mono">{hhmm(b.created_at)}</span></p>
          <SpeakButton id={`brief-${b.id}`} text={pointsSentence(b)} lang={me.language} t={t} className="-my-2 -mr-2" />
        </div>

        {/* the result first, when there is one */}
        {reply && understood && (
          <div className="mt-2 flex items-center gap-3 rounded-xl border-2 border-ok bg-ok-soft px-3 py-2">
            <BigCheck />
            <div className="min-w-0">
              <h3 className={cx("font-display text-2xl font-extrabold leading-tight", OK_INK)}>{t("s.res.all", { n })}</h3>
              {!isWorker && <p className="text-base">{t("s.res.allBy", { worker: reply.worker.name })}</p>}
              {reply.understood_at && <p className="font-mono text-sm text-muted">{hhmm(reply.understood_at)}</p>}
            </div>
          </div>
        )}
        {reply && !understood && unreadable && (
          <div role="status" className="mt-2 rounded-xl border-[2.5px] border-warn bg-warn-soft/70 px-3 py-2">
            <h3 className="flex items-center gap-2 font-display text-2xl font-extrabold leading-tight text-warn"><MarkIcon mark="unclear" size={30} />{t("s.res.unreadable")}</h3>
            <p className="mt-1 text-base">{t("s.res.unreadableHint")}</p>
          </div>
        )}
        {reply && !understood && !unreadable && reply.state === "missed" && (
          <div className="mt-2">
            <h3 className="flex items-center gap-2 font-display text-2xl font-extrabold leading-tight text-bad">
              <MarkIcon mark="mismatch" size={30} /><span className="hl hl-in text-ink">{t("s.res.some", { n: reply.said.length, total: n })}</span>
            </h3>
            <p className="mt-1 text-base text-muted">{t("s.res.someHint")}</p>
          </div>
        )}

        <PointList points={b.points} marks={marks} t={t} />
        <PlaceNote b={b} t={t} />

        {reply && last && (
          <figure className={cx("mt-3 rounded-xl border-2 border-ink/25 bg-paper px-3 py-2", unreadable && "border-[2.5px] border-warn bg-warn-soft/50")}>
            <figcaption className="font-hand text-base text-muted">{isWorker ? t("s.res.yourWords") : t("s.res.theirWords", { worker: reply.worker.name })} · <span className="font-mono">{hhmm(last.at)}</span></figcaption>
            <blockquote lang={last.language} className="font-hand text-xl leading-snug break-words">“{last.text}”</blockquote>
          </figure>
        )}
        {last && !last.unreadable && last.gloss && (
          <div className="mt-3">
            <p className="font-hand text-lg leading-tight">{t("s.res.understood")}</p>
            <p className="flex items-center gap-1 text-base break-words">
              <span className="min-w-0 flex-1"><Pill>{LANG_NAME[me.language]}</Pill> {last.gloss}</span>
              <SpeakButton id={`bgloss-${b.id}-${reply!.attempts.length}`} text={last.gloss} lang={me.language} t={t} className="-my-2" />
            </p>
          </div>
        )}
        {extras.length > 0 && (
          <div className="mt-3">
            <p className="font-hand text-lg leading-tight text-muted">{t("s.res.also")}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">{extras.map((p) => <li key={p.id}><Pill tint="pen">{p.label}</Pill></li>)}</ul>
          </div>
        )}
        {reply && reply.attempts.length > 1 && (
          <details className="mt-3 rounded-xl border-2 border-dashed border-ink/30 px-3">
            <summary className="flex min-h-12 cursor-pointer items-center font-semibold text-pen">{t("s.res.earlier", { n: reply.attempts.length - 1 })}</summary>
            <ol className="mb-2 space-y-2">
              {reply.attempts.slice(0, -1).reverse().map((a) => (
                <li key={a.at} className="border-t-2 border-dashed border-ink/20 pt-2">
                  <p className="font-mono text-sm text-muted">{hhmm(a.at)}{a.unreadable && <span className="font-sans font-semibold text-warn"> · {t("s.res.unchecked")}</span>}</p>
                  <p lang={a.language} className="font-hand text-lg leading-snug break-words">“{a.text}”</p>
                </li>
              ))}
            </ol>
          </details>
        )}

        {reply && !understood && isWorker && <SayBackBox b={b} reply={reply} t={t} lang={me.language} onBriefing={onBriefing} />}
        {reply && !understood && !isWorker && !reply.attempts.length && (
          <p className="mt-3 font-hand text-lg text-muted"><span className="dots">{t("s.card.waitingFor", { worker: reply.worker.name })}</span></p>
        )}
        {isSup && <Link href={`/briefing/${b.id}`} className="mt-2 inline-flex min-h-12 items-center font-semibold text-pen underline decoration-2 underline-offset-4">{t("s.card.record")} →</Link>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- roll call (crew channel)
const ROW_TONE: Record<BriefingRow["status"], string> = {
  waiting: "", not_yet: "", missed: "bg-warn-soft/70 border-l-[6px] border-l-warn", understood: "bg-ok-soft",
};

function RollStatus({ r, total, t }: { r: BriefingRow; total: number; t: T }) {
  if (r.status === "understood") return <span className={cx("inline-flex shrink-0 items-center gap-1.5 font-display text-lg font-extrabold leading-none", OK_INK)}><MarkIcon mark="match" size={26} />{t("s.roll.understood")}</span>;
  if (r.status === "missed") return <span className="inline-flex shrink-0 items-center gap-1.5 font-display text-lg font-extrabold leading-none text-warn"><MarkIcon mark="unclear" size={26} />{t("s.roll.partial", { n: r.said ?? 0, total })}</span>;
  const d = r.status === "waiting"
    ? "M16 4 C23 4, 28 9, 28 16 C28 23, 23 28, 16 28 C9 28, 4 23, 4 16 C4 9, 9 4, 15 4 M16 9 L16 16 L21 19"
    : "M16 4 C23 4, 28 9, 28 16 C28 23, 23 28, 16 28 C9 28, 4 23, 4 16 C4 9, 9 4, 15 4";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-display text-lg font-extrabold leading-none text-muted">
      <svg width={26} height={26} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <path {...P} d={d} stroke="var(--muted)" strokeWidth={3.5} strokeDasharray={r.status === "not_yet" ? "4 4" : undefined} />
      </svg>
      {t(r.status === "waiting" ? "s.roll.waiting" : "s.roll.notYet")}
    </span>
  );
}

/** Hand-drawn progress bar: wobbly outline, a marker stroke for the share understood, one tick per worker. */
function Progress({ n, total }: { n: number; total: number }) {
  const W = 300, x0 = 8, x1 = W - 8, x = x0 + (total ? (n / total) * (x1 - x0) : 0);
  return (
    <svg viewBox={`0 0 ${W} 26`} preserveAspectRatio="none" className="mt-2 h-6 w-full" role="img" aria-label={`${n}/${total}`}>
      <path {...P} d={`M4 6 C80 3, 200 5, ${W - 4} 4 C${W - 2} 10, ${W - 3} 16, ${W - 4} 22 C200 24, 90 21, 5 23 C3 17, 4 11, 4 6 Z`}
        stroke="var(--ink)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" fill="var(--paper)" />
      {n > 0 && <path {...P} key={n} d={`M${x0 + 2} 13.5 L${Math.max(x0 + 3, x - 2)} 13`} stroke="var(--ok)" strokeWidth={12} pathLength={1} className="draw" />}
      {Array.from({ length: Math.max(0, total - 1) }, (_, i) => {
        const tx = x0 + ((i + 1) / total) * (x1 - x0);
        return <path key={i} {...P} d={`M${tx} 7 L${tx + 1} 20`} stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={0.45} />;
      })}
    </svg>
  );
}

export function BriefingRollCard({ b, isSup, t }: { b: BriefingDTO; isSup: boolean; t: T }) {
  const { understood: n, total } = b.progress;
  const all = total > 0 && n === total;
  const label = (id: string) => b.points.find((p) => p.id === id)?.label ?? "";
  return (
    <section className="doodle pop my-4 overflow-hidden p-0" aria-label={t("s.roll.label")}>
      <header className="flex flex-wrap items-center gap-2 border-b-[2.5px] border-ink bg-hi px-4 py-2">
        <HazardIcon size={22} />
        <span className="font-hand text-lg leading-none">{t("s.roll.label")}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">{b.is_sandbox && <Pill tint="warn">{t("c.sandbox")}</Pill>}</span>
      </header>
      <div className="p-4">
        <p className="text-sm text-muted">{t("s.roll.from", { sup: b.supervisor.name })} · <span className="font-mono">{hhmm(b.created_at)}</span></p>
        <PointList points={b.points} t={t} big={false} />
        <PlaceNote b={b} t={t} />
        <div className="mt-4" role="status" aria-live="polite">
          <p className={cx("flex items-center gap-2 font-display text-2xl font-extrabold leading-tight", all && OK_INK)}>
            {all && <MarkIcon mark="match" size={30} />}
            {all ? t("s.roll.allDone") : t("s.roll.progress", { n, total })}
          </p>
          <Progress n={n} total={total} />
        </div>
      </div>
      {b.rows.length === 0 ? <p className="border-t-2 border-ink/15 px-4 py-3 text-muted">{t("s.roll.noWorkers")}</p> : (
        <ul>
          {b.rows.map((r) => (
            <li key={r.worker.id} className={cx("border-t-2 border-ink/15 px-4 py-3", ROW_TONE[r.status])}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="min-w-0 break-words font-display text-xl font-extrabold leading-tight">{r.worker.name}</span>
                  {r.is_me && <Pill tint="hi">{t("x.board.you")}</Pill>}
                  <Pill tint="pen">{LANG_NAME[r.worker.language]}</Pill>
                </div>
                <RollStatus r={r} total={b.points.length} t={t} />
              </div>
              {r.status === "missed" && r.missing.length > 0 && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base leading-snug">
                  <span className="font-hand text-lg">{t("s.roll.missing")}</span>
                  {r.missing.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 font-display font-extrabold text-bad"><MarkIcon mark="mismatch" size={16} />{label(id)}</span>
                  ))}
                </p>
              )}
              {isSup && r.conversation_id && (
                <Link href={`/c/${r.conversation_id}`} className="mt-1 inline-flex min-h-12 items-center gap-1 font-semibold text-pen underline decoration-2 underline-offset-4">{t("x.board.open")} →</Link>
              )}
              {r.is_me && !isSup && r.conversation_id && r.status !== "understood" && (
                <Link href={`/c/${r.conversation_id}`} className="mt-1 inline-flex min-h-12 items-center gap-1 font-semibold text-pen underline decoration-2 underline-offset-4">{t("s.roll.sayBack")} →</Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t-2 border-dashed border-ink/30 px-4 py-2">
        {b.redacted && <p className="font-hand text-base leading-tight text-muted">{t("s.roll.private", { sup: b.supervisor.name })}</p>}
        <p className="text-sm leading-snug text-muted">{t("s.extra")}</p>
        {isSup && <Link href={`/briefing/${b.id}`} className="inline-flex min-h-12 items-center font-semibold text-pen underline decoration-2 underline-offset-4">{t("s.card.record")} →</Link>}
      </div>
    </section>
  );
}

/** Crew channel, supervisor: the way into a new safety briefing (next to "Task for the crew" in the composer). */
export function BriefingEntry({ href, t }: { href: string; t: T }) {
  return (
    <Link href={href} className="doodle doodle-flat ml-auto inline-flex min-h-12 shrink-0 items-center gap-1.5 px-3 font-display text-sm font-extrabold leading-tight"
      style={{ background: "var(--bad-soft)", boxShadow: "2px 2px 0 var(--ink)" }}>
      <HazardIcon size={20} />{t("s.entry")}
    </Link>
  );
}

// ---------------------------------------------------------------- send sheet
export function BriefingForm({ crew, conversationId, me, t }: { crew: CrewDTO; conversationId: string; me: Me; t: T }) {
  const router = useRouter();
  const points = crew.safety_points ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const [place, setPlace] = useState<string>("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [pick, setPick] = useState<Lang | null>(null);
  useEffect(() => { if (!full) return; const id = setTimeout(() => setFull(false), 2500); return () => clearTimeout(id); }, [full]);

  const workers = crew.members.filter((m) => m.role === "worker");
  const langs = LANGS.filter((l) => workers.some((w) => w.language === l));
  const wl = pick ?? langs[0] ?? me.language;
  const wt = makeT(wl);
  const countErr = picked.length < MIN_POINTS || picked.length > MAX_POINTS ? t("s.form.err.count") : null;
  const noteErr = note.length > 200 ? t("s.form.err.note") : null;

  function toggle(id: string) {
    if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (picked.length >= MAX_POINTS) setFull(true);
    else setPicked([...picked, id]);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (countErr || noteErr || !workers.length) return;
    setBusy(true); setErr(null);
    try {
      // in list order, the order the crew reads them in
      const ordered = points.filter((p) => picked.includes(p.id)).map((p) => p.id);
      await api("POST /api/briefings", { point_ids: ordered, place_id: place || null, note: note.trim() || null });
      router.push(`/c/${conversationId}`);
    } catch (x) {
      setErr(x instanceof ApiError ? (x.status === 429 ? t("c.err.slow") : t("s.form.err.send")) : t("c.err.network"));
      setBusy(false);
    }
  }

  const chosen = points.filter((p) => picked.includes(p.id));
  const placeItem = crew.places.find((p) => p.id === place);
  const chip = (on: boolean) => cx("doodle doodle-flat min-h-12 px-4 py-2 text-left font-display text-base font-extrabold leading-tight", on && "text-paper");
  const chipStyle = (on: boolean) => (on ? { background: "var(--ink)", boxShadow: "3px 3px 0 var(--pen)" } : undefined);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
      <p className="mb-4 font-hand text-xl leading-tight">{workers.length ? t("s.form.to", { n: workers.length }) : <span className="text-bad">{t("x.form.noWorkers")}</span>}</p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <form onSubmit={submit} noValidate className="space-y-6">
          <fieldset>
            <legend className="font-hand text-lg leading-tight">{t("s.form.templates")}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const ids = presetPick(p.keys, points);
                return (
                  <button key={p.id} type="button" disabled={!ids.length} onClick={() => { setPicked(ids); setFull(false); }}
                    className="doodle doodle-flat inline-flex min-h-12 items-center gap-1.5 px-3 py-2 font-display text-base font-extrabold disabled:opacity-40"
                    style={{ background: "var(--hi)" }}>
                    <HazardIcon />{t(`s.preset.${p.id}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-hand text-lg leading-tight">{t("s.form.points")}</legend>
            <p className="text-sm text-muted">{t("s.form.pointsHint")}</p>
            {points.length === 0 ? <p className="mt-2 font-semibold text-bad">{t("s.form.noPoints")}</p> : (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {points.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <button key={p.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(p.id)} className={cx(chip(on), "flex items-center gap-2")} style={chipStyle(on)}>
                      <span aria-hidden="true" className={cx("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2", on ? "border-paper bg-hi" : "border-ink bg-card")}>
                        {on && <svg width={16} height={16} viewBox="0 0 32 32"><path {...P} d="M5 17 C8 19, 10 22, 12 25 C16 15, 22 9, 28 5" stroke="var(--ink)" strokeWidth={5} /></svg>}
                      </span>
                      <span className="min-w-0 break-words">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p role="status" className={cx("mt-2 font-display font-extrabold", full ? "text-bad" : "text-muted")}>
              {full ? t("s.form.err.max") : t("s.form.picked", { n: picked.length })}
            </p>
            {tried && countErr && <p role="alert" className="text-sm font-semibold text-bad">{countErr}</p>}
            <Link href="/crew" className="inline-flex min-h-12 items-center font-semibold text-pen underline decoration-2 underline-offset-4">{t("s.form.editList")} →</Link>
          </fieldset>

          <fieldset>
            <legend className="font-hand text-lg leading-tight">{t("s.form.place")} <span className="text-sm text-muted">· {t("c.form.optional")}</span></legend>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={t("s.form.place")}>
              {[{ id: "", label: t("s.form.anyPlace") }, ...crew.places].map((p) => (
                <button key={p.id || "any"} type="button" role="radio" aria-checked={place === p.id} onClick={() => setPlace(p.id)}
                  className={chip(place === p.id)} style={chipStyle(place === p.id)}>{p.label}</button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="font-hand text-lg leading-tight">{t("s.form.note")} <span className="text-sm text-muted">· {t("c.form.optional")}</span></span>
            <textarea value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)}
              className="doodle doodle-flat mt-1 w-full resize-y bg-card px-3 py-2 text-base" />
            <span className={cx("block text-right font-mono text-sm", note.length > 180 ? "text-warn" : "text-muted")}>{note.length}/200</span>
            {tried && noteErr && <span role="alert" className="block text-sm font-semibold text-bad">{noteErr}</span>}
          </label>

          <p className="flex items-start gap-2 text-base leading-snug text-muted"><HazardIcon size={20} /><span>{t("s.extra")}</span></p>
          {err && <p role="alert" className="font-semibold text-bad">{err}</p>}
          <Button tone="hi" type="submit" disabled={busy || !workers.length} className="w-full text-lg" style={{ background: "var(--hi)" }}>
            <HazardIcon size={20} />{busy ? <span className="dots">{t("s.form.sending")}</span> : t("s.form.send")}
          </Button>
        </form>

        <aside aria-label={t("s.form.preview", { lang: LANG_NAME[wl] })} className="lg:sticky lg:top-24 lg:self-start">
          {langs.length > 1 && (
            <div role="group" aria-label={t("x.form.previewIn")} className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-hand text-lg text-muted">{t("x.form.previewIn")}</span>
              {langs.map((l) => (
                <button key={l} type="button" aria-pressed={l === wl} onClick={() => setPick(l)}
                  className={cx("min-h-12 rounded-full border-2 border-ink px-4 font-display font-extrabold", l === wl ? "bg-ink text-paper" : "bg-card")}>
                  {LANG_NAME[l]}
                </button>
              ))}
            </div>
          )}
          <p className="mb-1 font-hand text-lg text-muted">{t("s.form.preview", { lang: LANG_NAME[wl] })}</p>
          <Preview t={wt} lang={wl}>
            <p className="text-sm text-muted">{wt("s.card.from", { sup: me.display_name, n: chosen.length })}</p>
            {chosen.length ? <PointList points={chosen.map((p) => ({ id: p.id, label: inLang(p.labels, wl) }))} t={wt} /> : <p className="mt-3 font-hand text-lg text-muted">—</p>}
            <PlaceNote b={{ place: placeItem ? inLang(placeItem.labels, wl) : null, note: note.trim() || null }} t={wt} />
            <p className="mt-3 font-display text-lg font-extrabold leading-tight">{wt("s.card.prompt", { n: chosen.length })}</p>
            <p className="font-hand text-lg leading-tight text-pen">{wt("c.restate.noOk")}</p>
          </Preview>
          {note.trim() && wl !== me.language && <p className="mt-2 text-sm text-muted">{t("s.form.previewNote")}</p>}
        </aside>
      </div>
    </main>
  );
}

function Preview({ t, lang, children }: { t: T; lang: Lang; children: ReactNode }) {
  return (
    <div className="doodle overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b-[2.5px] border-ink bg-hi px-4 py-2">
        <HazardIcon size={22} /><span className="font-hand text-lg leading-none">{t("s.card.label")}</span>
      </div>
      <div className="p-4" lang={lang}>{children}</div>
    </div>
  );
}
