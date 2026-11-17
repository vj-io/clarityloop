"use client";
// Language for signed-out pages (landing, login, join): remembered in localStorage, English by default.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { LANGS, type Lang } from "@/lib/types";
import { makeT } from "@/lib/i18n";

const KEY = "cl_lang";
const subs = new Set<() => void>();
const read = (): Lang => {
  try { const v = localStorage.getItem(KEY) as Lang | null; return v && LANGS.includes(v) ? v : "en"; } catch { return "en"; }
};
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export function usePublicLang() {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as Lang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem(KEY, l); } catch { /* storage blocked: choice lasts until reload */ }
    subs.forEach((f) => f());
  }, []);
  const t = useMemo(() => makeT(lang), [lang]);
  return { lang, setLang, t };
}
