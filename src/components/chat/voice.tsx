"use client";
// Speak instead of type, listen instead of read. Browser speech APIs only: no audio reaches or is kept by ClarityLoop.
// Where the browser lacks an API (Firefox has no SpeechRecognition; some systems have no Tamil voice) the button is hidden.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { T } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export const SPEECH_LANG: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", ta: "ta-IN" };
const P = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const noSub = () => () => {};
/** false during SSR and hydration, true after: browser-only checks must not change the first render. */
const useClient = () => useSyncExternalStore(noSub, () => true, () => false);

// ---------------------------------------------------------------- speak instead of type
type RecResult = ArrayLike<{ transcript: string }>;
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<RecResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecCtor = new () => Rec;
const recCtor = (): RecCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const NOTE_KEY = "cl_voice_note";

export type Mic = ReturnType<typeof useMic>;
/** Mic state for one text box. Words land in the box (prefixed by what was already typed); never sent by itself. */
export function useMic(lang: Lang, value: string, onChange: (v: string) => void) {
  const client = useClient();
  const [state, setState] = useState<"idle" | "listening" | "denied">("idle");
  const [note, setNote] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => () => rec.current?.abort(), []);
  const Ctor = client ? recCtor() : null;

  function toggle() {
    if (rec.current) { rec.current.stop(); return; }
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[lang];
    r.interimResults = true;
    r.continuous = false;   // stops after a pause; tap again to add more (the prefix keeps what is there)
    const prefix = value && !/\s$/.test(value) ? `${value} ` : value;
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      onChange(prefix + s);
    };
    r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") setState("denied"); };
    r.onend = () => { rec.current = null; setState((s) => (s === "listening" ? "idle" : s)); };
    try { if (!localStorage.getItem(NOTE_KEY)) { setNote(true); localStorage.setItem(NOTE_KEY, "1"); } } catch { /* storage blocked: skip the note */ }
    rec.current = r;
    setState("listening");
    try { r.start(); } catch { rec.current = null; setState("idle"); }
  }
  return { supported: !!Ctor, state, note, toggle };
}

export function MicButton({ mic, t, disabled }: { mic: Mic; t: T; disabled?: boolean }) {
  if (!mic.supported) return null;
  const on = mic.state === "listening";
  return (
    <button type="button" onClick={mic.toggle} disabled={disabled} aria-pressed={on} aria-label={t(on ? "v.mic.stop" : "v.mic.start")}
      className={`doodle doodle-flat inline-flex h-12 w-12 shrink-0 items-center justify-center disabled:opacity-40 ${on ? "wiggle" : ""}`}
      style={{ background: on ? "var(--hi)" : "var(--card)", boxShadow: "2px 2px 0 var(--ink)" }}>
      <MicDoodle on={on} />
    </button>
  );
}

/** One calm line under the box: listening, blocked, and (first use only) what happens to the voice. */
export function MicStatus({ mic, t }: { mic: Mic; t: T }) {
  if (!mic.supported) return null;
  return (
    <div role="status" aria-live="polite">
      {mic.state === "listening" && <p className="mt-1 font-hand text-lg leading-tight text-pen">{t("v.mic.listening")} · {t("v.mic.check")}</p>}
      {mic.state === "denied" && <p className="mt-1 text-sm font-semibold text-muted">{t("v.mic.denied")}</p>}
      {mic.note && <p className="mt-1 text-sm leading-snug text-muted">{t("v.mic.privacy")}</p>}
    </div>
  );
}

function MicDoodle({ on }: { on: boolean }) {
  return (
    <svg width={26} height={26} viewBox="0 0 32 32" aria-hidden="true">
      <path {...P} d="M16 4 C19 4, 20.5 6, 20.5 8.5 L20.5 15.5 C20.5 18.5, 18.5 20, 16 20 C13.3 20, 11.5 18.3, 11.5 15.5 L11.5 8.5 C11.5 6, 13 4, 16 4 Z" stroke="var(--ink)" strokeWidth={3} fill={on ? "var(--ink)" : "none"} />
      <path {...P} d="M7.5 14.5 C7.5 20.5, 11.5 24, 16 24 C20.5 24, 24.5 20.8, 24.5 14.5 M16 24 L16 28.5 M11 28.6 L21 28.4" stroke="var(--ink)" strokeWidth={3} />
    </svg>
  );
}

// ---------------------------------------------------------------- listen instead of read
const synth = () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);
/** A voice for the reader's language: the exact Indian locale first, else any voice of that language. */
const voiceFor = (lang: Lang) => {
  const vs = synth()?.getVoices() ?? [];
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  return vs.find((v) => norm(v) === SPEECH_LANG[lang].toLowerCase()) ?? vs.find((v) => norm(v).startsWith(lang)) ?? null;
};
// voices load asynchronously (Chrome fills them after "voiceschanged")
const subVoices = (f: () => void) => {
  const s = synth();
  if (!s) return () => {};
  s.addEventListener("voiceschanged", f);
  return () => s.removeEventListener("voiceschanged", f);
};
// one utterance at a time on the whole page
let speaking: string | null = null;
const speakSubs = new Set<() => void>();
const setSpeaking = (k: string | null) => { speaking = k; speakSubs.forEach((f) => f()); };
const subSpeaking = (f: () => void) => { speakSubs.add(f); return () => { speakSubs.delete(f); }; };

/** Reads `text` aloud in `lang`. Hidden when the device has no voice for that language. */
export function SpeakButton({ id, text, lang, t, className = "" }: { id: string; text: string; lang: Lang; t: T; className?: string }) {
  const uri = useSyncExternalStore(subVoices, () => voiceFor(lang)?.voiceURI ?? "", () => "");
  const active = useSyncExternalStore(subSpeaking, () => speaking === id, () => false);
  useEffect(() => () => { if (speaking === id) { synth()?.cancel(); setSpeaking(null); } }, [id]);
  if (!uri || !text.trim()) return null;

  function toggle() {
    const s = synth();
    if (!s) return;
    s.cancel();
    if (active) { setSpeaking(null); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[lang];
    u.voice = s.getVoices().find((v) => v.voiceURI === uri) ?? null;
    u.onend = u.onerror = () => { if (speaking === id) setSpeaking(null); };
    setSpeaking(id);
    s.speak(u);
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={active} aria-label={t(active ? "v.listenStop" : "v.listen")}
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${active ? "text-ink" : "text-pen"} ${className}`}>
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-current ${active ? "wiggle" : ""}`}
        style={{ background: active ? "var(--hi)" : "transparent" }}>
        <SpeakerDoodle on={active} />
      </span>
    </button>
  );
}

function SpeakerDoodle({ on }: { on: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 32 32" aria-hidden="true">
      <path {...P} d="M4.5 12.5 L10 12.3 L17.5 5.5 L17.8 26.5 L10 19.8 L4.6 19.6 Z" stroke="currentColor" strokeWidth={3} />
      <path {...P} d={on ? "M21.5 11 C23.5 13.5, 23.5 18.5, 21.5 21 M25.5 7.5 C29.5 12, 29.5 20, 25.5 24.5" : "M21.5 11.5 C23.3 13.8, 23.3 18.2, 21.5 20.5"} stroke="currentColor" strokeWidth={3} />
    </svg>
  );
}
