"use client";
// Site words: the crew's own glossary. Supervisor edits it on /crew (with the crew's flagged suggestions on top);
// everyone can read it from the crew chat; a reader who flags a translation can name the wrong word.
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/session";
import type { T } from "@/lib/i18n";
import { CORE_LANGS, inLang, LANG_NAME, LANGS, type Lang, type SuggestionDTO, type TermDTO } from "@/lib/types";
import { Card, Field, Input, Pill } from "@/components/ui";
import { Btn, ErrorBox, errMsg } from "@/components/shell/Common";

const linkBtn = "inline-flex min-h-12 items-center font-semibold text-pen underline decoration-2 underline-offset-4";
const saveErr = (e: unknown, t: T) => (e instanceof ApiError && e.status === 409 ? t("g.dup") : errMsg(e, t));

/** After "Translation looks wrong": one short field for the wrong word, one optional for its meaning. */
export function WhichWord({ t, onSend }: { t: T; onSend: (word: string, meaning: string) => Promise<void> }) {
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "err" | "sent" | "skip">("idle");
  if (state === "skip") return null;
  if (state === "sent") return <p role="status" className="pb-2 text-base font-semibold text-[#0f6b31]">{t("g.sent")}</p>;
  return (
    <form className="space-y-2 pb-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!word.trim()) return;
      setState("busy");
      try { await onSend(word.trim(), meaning.trim()); setState("sent"); } catch { setState("err"); }
    }}>
      <Field label={t("g.which")}><Input value={word} maxLength={40} onChange={(e) => setWord(e.target.value)} placeholder={t("g.whichPh")} /></Field>
      <Field label={t("g.means")}><Input value={meaning} maxLength={120} onChange={(e) => setMeaning(e.target.value)} /></Field>
      {state === "err" && <p role="alert" className="text-sm font-semibold text-bad">{t("g.sendFailed")}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="submit" tone="pen" disabled={state === "busy" || !word.trim()}>{t("g.send")}</Btn>
        <button type="button" className={`${linkBtn} text-muted`} onClick={() => setState("skip")}>{t("g.skip")}</button>
      </div>
    </form>
  );
}

/** Crew chat header: the site words, read-only, in the reader's language. Loaded on first open. */
export function SiteWordsLink({ t, lang }: { t: T; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState<TermDTO[] | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(() => { setErr(false); api("GET /api/glossary").then((r) => setTerms(r.terms), () => setErr(true)); }, []);
  return (
    <>
      <button type="button" aria-expanded={open} className={`${linkBtn} text-base`}
        onClick={() => { setOpen((v) => !v); if (!terms) load(); }}>
        {t("g.link")}{terms ? ` · ${terms.length}` : ""}
      </button>
      {open && (
        <div className="w-full rounded-xl border-2 border-ink/30 bg-card px-3 py-2">
          <p className="font-hand text-lg leading-tight">{t("g.listTitle")}</p>
          {err ? <button type="button" className={`${linkBtn} text-bad`} onClick={load}>{t("g.loadFailed")}</button>
            : !terms ? <p className="text-base text-muted"><span className="dots">…</span></p>
            : !terms.length ? <p className="text-base text-muted">{t("g.empty")}</p>
            : (
              <ul className="mt-1 divide-y-2 divide-dashed divide-ink/20">
                {terms.map((x) => (
                  <li key={x.id} className="py-1.5 text-base leading-snug break-words">
                    <span className="font-display font-extrabold">{x.term}</span> — <span lang={lang}>{inLang(x.meanings, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          <p className="mt-1 text-base text-muted">{t("g.readOnly")}</p>
        </div>
      )}
    </>
  );
}

type Prefill = { term: string; meaning: string; lang: Lang; suggestion: SuggestionDTO } | null;

/** /crew: add, edit and remove site words; the crew's flagged words on top, one tap to add. */
export function SiteWords({ t, lang }: { t: T; lang: Lang }) {
  const [terms, setTerms] = useState<TermDTO[] | null>(null);
  const [sugs, setSugs] = useState<SuggestionDTO[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill>(null);
  const [formKey, setFormKey] = useState(0);   // remounts the add form when a suggestion fills it

  const load = useCallback(async () => {
    try { const r = await api("GET /api/glossary"); setTerms(r.terms); setSugs(r.suggestions); setErr(null); }
    catch (e) { setErr(errMsg(e, t)); }
  }, [t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the first fetch; state is set when it resolves
  useEffect(() => { void load(); }, [load]);

  const sorted = (l: TermDTO[]) => [...l].sort((a, b) => a.term.localeCompare(b.term));
  async function dismiss(id: string) {
    try { await api("PATCH /api/glossary/suggestions", { id, status: "dismissed" }); setSugs((s) => s.filter((x) => x.id !== id)); }
    catch (e) { setErr(errMsg(e, t)); }
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-extrabold">{t("g.title")}</h2>
      <p className="font-hand text-base leading-tight text-muted">{t("g.hint")}</p>
      {err && <div className="mt-2"><ErrorBox message={err} onRetry={load} t={t} /></div>}

      {sugs.length > 0 && (
        <section className="mt-3 rounded-xl border-[2.5px] border-dashed border-warn bg-warn-soft/60 p-3" aria-label={t("g.sugTitle")}>
          <h3 className="font-display text-lg font-extrabold leading-tight">{t("g.sugTitle")}</h3>
          <p className="text-base leading-snug">{t("g.sugHint")}</p>
          <ul className="mt-2 space-y-2">
            {sugs.map((s) => (
              <li key={s.id} className="rounded-lg border-2 border-ink/30 bg-card px-3 py-2">
                <p className="font-display text-lg font-extrabold break-words">{s.word}</p>
                {s.meaning && <p lang={s.lang} className="text-base break-words">{t("g.sugMeans", { meaning: s.meaning })}</p>}
                <p className="text-sm text-muted">{t("g.sugBy", { name: s.by, lang: LANG_NAME[s.lang] })}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4">
                  <button type="button" className={linkBtn} onClick={() => {
                    setPrefill({ term: s.word, meaning: s.meaning ?? "", lang: s.meaning ? s.lang : lang, suggestion: s });
                    setFormKey((k) => k + 1);
                    requestAnimationFrame(() => document.getElementById("g-add-meaning")?.focus());
                  }}>{t("g.sugAdd")}</button>
                  <button type="button" className={`${linkBtn} text-muted`} onClick={() => dismiss(s.id)}>{t("g.sugDismiss")}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {terms && (terms.length === 0
        ? <p className="mt-3 text-base">{t("g.empty")}</p>
        : (
          <ul className="mt-2 divide-y-2 divide-dashed divide-ink/30">
            {terms.map((x) => (
              <TermRow key={x.id} x={x} t={t} lang={lang}
                onSaved={(n) => setTerms((l) => sorted((l ?? []).map((y) => (y.id === n.id ? n : y))))}
                onRemoved={() => setTerms((l) => (l ?? []).filter((y) => y.id !== x.id))} />
            ))}
          </ul>
        ))}

      <AddTerm key={formKey} t={t} lang={lang} prefill={prefill} onAdded={(n) => {
        setTerms((l) => sorted([...(l ?? []), n]));
        if (prefill) setSugs((s) => s.filter((x) => x.id !== prefill.suggestion.id));
        setPrefill(null); setFormKey((k) => k + 1);
      }} />
    </Card>
  );
}

function AddTerm({ t, lang, prefill, onAdded }: { t: T; lang: Lang; prefill: Prefill; onAdded: (x: TermDTO) => void }) {
  const [term, setTerm] = useState(prefill?.term ?? "");
  const [meaning, setMeaning] = useState(prefill?.meaning ?? "");
  const [mLang, setMLang] = useState<Lang>(prefill?.lang ?? lang);   // typing over a suggested meaning means it is in my language
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="mt-4 space-y-3 border-t-2 border-dashed border-ink/30 pt-3" onSubmit={async (e) => {
      e.preventDefault();
      if (!term.trim() || !meaning.trim()) return;
      setBusy(true); setErr(null);
      try {
        onAdded((await api("POST /api/glossary", { term: term.trim(), meaning: meaning.trim(), lang: mLang, ...(prefill ? { suggestion_id: prefill.suggestion.id } : {}) })).term);
      } catch (x) { setErr(saveErr(x, t)); setBusy(false); }
    }}>
      {prefill && <p role="status" className="font-hand text-lg leading-tight text-pen">{t("g.prefilled", { name: prefill.suggestion.by })}</p>}
      <Field label={t("g.word")}>
        <Input value={term} maxLength={40} onChange={(e) => setTerm(e.target.value)} placeholder={t("g.wordPh")} />
      </Field>
      <Field label={t("g.meaning", { lang: LANG_NAME[mLang] })} hint={t("g.meaningHint")} error={err}>
        <Input id="g-add-meaning" value={meaning} maxLength={120} onChange={(e) => { setMeaning(e.target.value); setMLang(lang); }} />
      </Field>
      <Btn type="submit" disabled={busy || !term.trim() || !meaning.trim()}>{busy ? <span className="dots">{t("g.adding")}</span> : t("g.add")}</Btn>
    </form>
  );
}

function TermRow({ x, t, lang, onSaved, onRemoved }: { x: TermDTO; t: T; lang: Lang; onSaved: (x: TermDTO) => void; onRemoved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ term: x.term, ...x.meanings });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!edit) {
    return (
      <li className="flex items-start justify-between gap-2 py-1.5">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-display text-lg font-extrabold break-words">{x.term}</span>
            {x.source === "flag" && <Pill tint="warn">{t("g.fromFlag")}</Pill>}
          </span>
          <span lang={lang} className="block text-base leading-snug break-words">{inLang(x.meanings, lang)}</span>
          <span className="block text-sm leading-tight break-words text-muted">{LANGS.filter((l) => l !== lang).flatMap((l) => x.meanings[l] ?? []).join(" · ")}</span>
          {err && <span role="alert" className="block text-sm font-semibold text-bad">{err}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <button type="button" className={linkBtn} aria-label={`${t("g.edit")}: ${x.term}`} onClick={() => setEdit(true)}>{t("g.edit")}</button>
          <button type="button" className={`${linkBtn} text-bad`} aria-label={`${t("g.remove")}: ${x.term}`} disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await api("DELETE /api/glossary", { id: x.id }); onRemoved(); } catch (e) { setErr(errMsg(e, t)); setBusy(false); }
          }}>{t("g.remove")}</button>
        </span>
      </li>
    );
  }
  return (
    <li className="py-2">
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
          const r = await api("PATCH /api/glossary", { id: x.id, term: f.term.trim(), meaning_en: f.en.trim(), meaning_hi: f.hi.trim(), meaning_ta: f.ta.trim() });
          onSaved(r.term); setEdit(false);
        } catch (e2) { setErr(saveErr(e2, t)); }
        setBusy(false);
      }}>
        <Field label={t("g.word")}><Input value={f.term} maxLength={40} onChange={(e) => setF({ ...f, term: e.target.value })} /></Field>
        {CORE_LANGS.map((l) => (
          <Field key={l} label={t("g.meaningIn", { lang: LANG_NAME[l] })}>
            <Input lang={l} value={f[l]} maxLength={120} onChange={(e) => setF({ ...f, [l]: e.target.value })} />
          </Field>
        ))}
        {err && <p role="alert" className="text-sm font-semibold text-bad">{err}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Btn type="submit" disabled={busy || !f.term.trim() || CORE_LANGS.some((l) => !f[l].trim())}>{t("g.save")}</Btn>
          <button type="button" className={`${linkBtn} text-muted`} onClick={() => { setEdit(false); setF({ term: x.term, ...x.meanings }); }}>{t("g.cancel")}</button>
        </div>
      </form>
    </li>
  );
}
