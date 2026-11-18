"use client";
// Send as task (supervisor only): action, object, place, 24-hour time, quantity + unit, note.
// A live preview shows the card the worker will receive, in the worker's language.
// In a crew channel the same form sends one task to every worker (POST /api/broadcasts), with a safety toggle.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRequireMe } from "@/components/shell/guard";
import { Button, Field, Input, Pill, Select, Spinner } from "@/components/ui";
import { BG, TaskFacts } from "@/components/chat/cards";
import { draftKey, type StoredDraft } from "@/components/chat/Bubble";
import { ClipboardDoodle } from "@/components/chat/doodles";
import { api, ApiError } from "@/lib/client/session";
import { makeT, type T } from "@/lib/i18n";
import { LANG_NAME, LANGS, type Api, type CrewDTO, type Lang, type ListItem, type RecentTask } from "@/lib/types";

type Conv = Api["GET /api/conversations/:id"]["res"];

export default function NewTaskPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { me, t } = useRequireMe();
  const router = useRouter();
  const [crew, setCrew] = useState<CrewDTO | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [f, setF] = useState({ action: "", object: "", place: "", time: "", qty: "", unit: "", note: "" });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [safety, setSafety] = useState(false);
  const [pick, setPick] = useState<Lang | null>(null);   // crew: which worker language the preview shows
  // "Make this a task": fields filled from a chat message stay marked until the supervisor changes them
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [fromMsg, setFromMsg] = useState<{ text: string; found: boolean; assumed: boolean } | null>(null);
  const [recent, setRecent] = useState<RecentTask[]>([]);   // "Send again"
  const set = (k: keyof typeof f) => (v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    setFilled((m) => { if (!m.has(k)) return m; const n = new Set(m); n.delete(k); return n; });
  };

  useEffect(() => {
    if (!me) return;
    if (me.role !== "supervisor") { router.replace(`/c/${conversationId}`); return; }
    Promise.all([api("GET /api/crew"), api("GET /api/conversations/:id", undefined, { id: conversationId })])
      .then(([c, v]) => {
        setCrew(c.crew); setConv(v);
        // "Send again" is a shortcut: the form works without it, and a chip whose action or place left the lists is dropped
        api("GET /api/tasks/recent").then((r) => setRecent(r.recent.filter((x) =>
          c.crew.actions.some((a) => a.id === x.action_id) && c.crew.places.some((p) => p.id === x.place_id)))).catch(() => {});
        let stored: StoredDraft | null = null;
        try { stored = JSON.parse(sessionStorage.getItem(draftKey(conversationId)) ?? "null"); sessionStorage.removeItem(draftKey(conversationId)); } catch { /* none */ }
        if (!stored) return;
        const d = stored.draft;
        const pre: Partial<Record<keyof typeof f, string>> = {};
        if (d?.action_id && c.crew.actions.some((a) => a.id === d.action_id)) pre.action = d.action_id;
        if (d?.object_text) pre.object = d.object_text;
        if (d?.place_id && c.crew.places.some((p) => p.id === d.place_id)) pre.place = d.place_id;
        if (d?.due_time && Number(d.due_time.slice(3)) % 5 === 0) pre.time = d.due_time;   // the minute picker has 5-minute steps
        if (d?.quantity != null) { pre.qty = String(d.quantity); if (d.unit) pre.unit = d.unit; }
        setF((s) => ({ ...s, ...pre }));
        setFilled(new Set(Object.keys(pre)));
        setFromMsg({ text: stored.text, found: Object.keys(pre).length > 0, assumed: Boolean(pre.time && d?.time_assumed) });
        if (Object.keys(pre).length) setTried(true);   // the required fields still missing show at once
      })
      .catch(() => setLoadErr(true));
  }, [me, conversationId, router]);

  const qtyNum = f.qty.trim() === "" ? null : Number(f.qty);
  const errors = {
    action: !f.action ? t("c.form.err.action") : null,
    object: !f.object.trim() ? t("c.form.err.objectMissing") : f.object.length > 80 ? t("c.form.err.object") : null,
    place: !f.place ? t("c.form.err.place") : null,
    time: !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time) ? t("c.form.err.time") : null,
    qty: qtyNum !== null && (!Number.isFinite(qtyNum) || qtyNum <= 0 || qtyNum > 100000) ? t("c.form.err.qty") : null,
    note: f.note.length > 280 ? t("c.form.err.note") : null,
  };
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null);

  const isCrew = conv?.conversation.kind === "crew";
  const workers = crew?.members.filter((m) => m.role === "worker") ?? [];
  const crewLangs = LANGS.filter((l) => workers.some((w) => w.language === l));
  const workerLang = isCrew ? pick ?? crewLangs[0] ?? me?.language ?? "en" : conv?.conversation.other.language ?? me?.language ?? "en";
  const wt = makeT(workerLang);
  const label = (list: ListItem[] | undefined, id: string) => list?.find((x) => x.id === id)?.labels[workerLang] ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean) || (isCrew && !workers.length)) return;
    setBusy(true); setErr(null);
    const fields = {
      action_id: f.action, object_text: f.object.trim(), place_id: f.place,
      due_time: f.time, quantity: qtyNum, unit: qtyNum !== null ? f.unit.trim() || null : null, note: f.note.trim() || null,
    };
    try {
      if (isCrew) await api("POST /api/broadcasts", { ...fields, is_safety: safety });
      else await api("POST /api/tasks", { conversation_id: conversationId, ...fields });
      router.push(`/c/${conversationId}`);
    } catch (e) {
      setErr(e instanceof ApiError ? (e.status === 429 ? t("c.err.slow") : t("c.form.err.send")) : t("c.err.network"));
      setBusy(false); // inputs stay as typed
    }
  }

  const back = `/c/${conversationId}`;
  if (!me || (!crew && !loadErr)) return <><AppHeader title={t("c.form.title")} back={back} /><div className="p-6"><Spinner label={t("c.loading")} /></div></>;
  if (loadErr || !crew) return <><AppHeader title={t("c.form.title")} back={back} /><p className="p-6 font-semibold text-bad">{t("c.loadFailed")}</p></>;

  const other = conv?.conversation.other;
  return (
    <>
      <AppHeader title={t(isCrew ? "x.form.title" : "c.form.title")} back={back} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        {isCrew ? <p className="mb-4 font-hand text-xl leading-tight">{workers.length ? t("x.form.to", { n: workers.length }) : <span className="text-bad">{t("x.form.noWorkers")}</span>}</p>
          : other && <p className="mb-4 font-hand text-xl leading-tight">{t("c.form.to", { name: other.display_name, lang: LANG_NAME[other.language] })}</p>}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <form onSubmit={submit} noValidate className="space-y-5">
            {fromMsg && (
              <div role="status" className="doodle doodle-flat px-3 py-2" style={{ background: fromMsg.found ? "var(--hi)" : "var(--card)" }}>
                <p className="font-display text-base font-extrabold leading-snug">{t(fromMsg.found ? "g.draftFilled" : "g.draftNone")}</p>
                <p className="mt-1 text-sm leading-snug break-words"><span className="text-muted">{t("g.draftFrom")}</span> “{fromMsg.text}”</p>
              </div>
            )}
            {recent.length > 0 && (
              <div role="group" aria-labelledby="again">
                <p id="again" className="font-hand text-lg leading-tight">{t("b.again.title")}</p>
                <p className="text-sm text-muted">{t(recent[0].sample ? "b.again.hintSample" : "b.again.hint")}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {recent.map((r, i) => (
                    <button key={i} type="button" className="doodle doodle-flat flex min-h-12 flex-wrap items-center gap-x-2 px-3 py-2 text-left text-base font-semibold"
                      onClick={() => {   // everything except the time
                        setF((s) => ({ ...s, action: r.action_id, object: r.object_text, place: r.place_id, qty: r.quantity == null ? "" : String(r.quantity), unit: r.unit ?? "" }));
                        setFilled((m) => new Set([...m].filter((k) => k === "time")));
                      }}>
                      {[crew.actions.find((a) => a.id === r.action_id)?.label, r.object_text, crew.places.find((p) => p.id === r.place_id)?.label,
                        r.quantity == null ? null : `${r.quantity} ${r.unit ?? ""}`.trim()].filter(Boolean).join(" · ")}
                      {r.sample && <Pill tint="warn">{t("b.again.sample")}</Pill>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Filled on={filled.has("action")} t={t} />
            <Picker label={t("c.f.action")} items={crew.actions} value={f.action} onChange={set("action")} error={show("action")} t={t} />
            <Filled on={filled.has("object")} t={t} />
            <Field label={t("c.form.object")} hint={t("c.form.objectHint")} error={show("object")}>
              <Input value={f.object} maxLength={80} onChange={(e) => set("object")(e.target.value)} placeholder={t("c.form.objectPh")} />
            </Field>
            <Filled on={filled.has("place")} t={t} />
            <Picker label={t("c.f.place")} items={crew.places} value={f.place} onChange={set("place")} error={show("place")} t={t} />
            <Filled on={filled.has("time")} t={t} text={fromMsg?.assumed ? t("g.timeAssumed") : undefined} />
            <Field label={t("c.form.time")} hint={t("c.form.timeHint")} error={show("time")}>
              {/* Two selects, not <input type="time">: that shows AM/PM in 12-hour locales, and the PRD wants 24-hour. */}
              <div className="flex items-center gap-2 font-mono text-lg">
                <Select aria-label="HH" value={f.time.slice(0, 2)} className="w-24 font-mono text-lg"
                  onChange={(e) => set("time")(e.target.value ? `${e.target.value}:${f.time.slice(3, 5) || "00"}` : "")}>
                  <option value="">--</option>
                  {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")).map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
                <span aria-hidden="true">:</span>
                <Select aria-label="MM" value={f.time.slice(3, 5)} disabled={!f.time} className="w-24 font-mono text-lg"
                  onChange={(e) => set("time")(`${f.time.slice(0, 2)}:${e.target.value}`)}>
                  {!f.time && <option value="">--</option>}
                  {Array.from({ length: 12 }, (_, m) => String(m * 5).padStart(2, "0")).map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </div>
            </Field>
            <Filled on={filled.has("qty")} t={t} />
            <div className="flex flex-wrap gap-3">
              <div className="w-36"><Field label={t("c.form.qty")} hint={t("c.form.optional")} error={show("qty")}>
                <Input type="number" inputMode="numeric" min={1} value={f.qty} onChange={(e) => set("qty")(e.target.value)} className="font-mono text-lg" />
              </Field></div>
              {f.qty.trim() !== "" && <div className="min-w-0 flex-1"><Field label={t("c.form.unit")} hint={t("c.form.unitHint")}>
                <Input value={f.unit} maxLength={30} onChange={(e) => set("unit")(e.target.value)} />
              </Field></div>}
            </div>
            <Field label={t("c.form.note")} hint={t("c.form.optional")} error={show("note")}>
              <textarea value={f.note} maxLength={280} rows={3} onChange={(e) => set("note")(e.target.value)}
                className="doodle doodle-flat w-full resize-y bg-card px-3 py-2 text-base" />
              <span className={`block text-right font-mono text-sm ${f.note.length > 260 ? "text-warn" : "text-muted"}`}>{f.note.length}/280</span>
            </Field>
            {isCrew && (
              <label className="doodle doodle-flat flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5" style={safety ? { background: "var(--bad-soft)" } : undefined}>
                <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-[var(--bad)]" />
                <span>
                  <span className="block font-display text-lg font-extrabold leading-tight">{t("x.form.safety")}</span>
                  <span className="block text-base text-muted">{t("x.form.safetyHint")}</span>
                </span>
              </label>
            )}
            {err && <p role="alert" className="font-semibold text-bad">{err}</p>}
            <Button tone="hi" type="submit" disabled={busy || (isCrew && !workers.length)} className="w-full text-lg" style={BG.hi}>
              <ClipboardDoodle />{busy ? <span className="dots">{t("c.form.sending")}</span> : t(isCrew ? "x.form.send" : "c.form.send")}
            </Button>
          </form>

          <aside aria-label={t("c.form.preview")} className="lg:sticky lg:top-24 lg:self-start">
            {isCrew && crewLangs.length > 1 && (
              <div role="group" aria-label={t("x.form.previewIn")} className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-hand text-lg text-muted">{t("x.form.previewIn")}</span>
                {crewLangs.map((l) => (
                  <button key={l} type="button" aria-pressed={l === workerLang} onClick={() => setPick(l)}
                    className={`min-h-12 rounded-full border-2 border-ink px-4 font-display font-extrabold ${l === workerLang ? "bg-ink text-paper" : "bg-card"}`}>
                    {LANG_NAME[l]}
                  </button>
                ))}
              </div>
            )}
            <p className="mb-1 font-hand text-lg text-muted">{t("c.form.preview", { lang: LANG_NAME[workerLang] })}</p>
            <div className="doodle overflow-hidden p-0">
              <div className="flex items-center gap-2 border-b-[2.5px] border-ink bg-pen-soft px-4 py-2">
                <span className="font-hand text-lg leading-none text-pen">{wt("c.card.task")}</span>
                <span className="ml-auto flex flex-wrap justify-end gap-1">
                  {isCrew && safety && <Pill tint="bad">{wt("x.form.safety")}</Pill>}
                  {isCrew && <Pill tint="hi">{wt("x.task.crewBadge")}</Pill>}
                  {me.is_sandbox && <Pill tint="warn">{wt("c.sandbox")}</Pill>}
                </span>
              </div>
              <div className="p-4" lang={workerLang}>
                <TaskFacts t={wt} v={{
                  action: label(crew.actions, f.action), object: f.object.trim(), place: label(crew.places, f.place),
                  due_time: f.time, quantity: qtyNum !== null && Number.isFinite(qtyNum) ? qtyNum : null,
                  unit: f.unit.trim() || null, note: f.note.trim() || null, is_sandbox: me.is_sandbox,
                }} />
                <p className="mt-3 font-hand text-lg leading-tight text-pen">{wt("c.restate.noOk")}</p>
              </div>
            </div>
            {workerLang !== me.language && <p className="mt-2 text-sm text-muted">{t("c.form.previewNote")}</p>}
          </aside>
        </div>
      </main>
    </>
  );
}

/** Mark on a field filled from a chat message: icon + words + colour, gone once the supervisor changes the field. */
function Filled({ on, t, text }: { on: boolean; t: T; text?: string }) {
  if (!on) return null;
  return (
    <p className="mb-1 flex items-center gap-1.5 font-hand text-lg leading-tight text-pen">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {text ?? t("g.filledMark")}
    </p>
  );
}

/** Big chips for short lists (<= 8), a select for long ones. */
function Picker({ label, items, value, onChange, error, t }: {
  label: string; items: ListItem[]; value: string; onChange: (v: string) => void; error: string | null; t: T;
}) {
  if (items.length > 8) {
    return (
      <Field label={label} error={error}>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("c.form.pick")}</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </Select>
      </Field>
    );
  }
  return (
    <fieldset>
      <legend className="font-hand text-lg leading-tight">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {items.map((i) => {
          const on = i.id === value;
          return (
            <button key={i.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(i.id)}
              className={`doodle doodle-flat min-h-12 px-4 py-2 font-display text-base font-extrabold transition-transform ${on ? "text-paper" : ""}`}
              style={on ? { background: "var(--ink)", boxShadow: "3px 3px 0 var(--pen)" } : undefined}>
              {i.label}
            </button>
          );
        })}
      </div>
      {error && <span role="alert" className="mt-1 block text-sm font-semibold text-bad">{error}</span>}
    </fieldset>
  );
}
