"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, signOut, useMe } from "@/lib/client/session";
import { makeT } from "@/lib/i18n";
import type { Lang, Me } from "@/lib/types";
import { Brand, cx } from "./Common";
import { ME_CHANGED } from "./guard";
import { BetaNote, LanguagePicker } from "./LanguagePicker";

/** Shared signed-in header. Props: title (page title), back (href of the screen to go back to). */
export function AppHeader({ title, back }: { title?: string; back?: string }) {
  const { me: loaded } = useMe();
  const [override, setOverride] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const path = usePathname();
  const me = override ?? loaded ?? null;
  const t = useMemo(() => makeT(me?.language ?? "en"), [me?.language]);

  useEffect(() => {
    const on = (e: Event) => setOverride((e as CustomEvent<Me>).detail);
    window.addEventListener(ME_CHANGED, on);
    return () => window.removeEventListener(ME_CHANGED, on);
  }, []);

  // the static route titles are English (for crawlers); a signed-in reader gets the page title in their language
  useEffect(() => { if (me && title) document.title = `${title} · ClarityLoop`; }, [me, title]);

  async function setLang(language: Lang) {
    setBusy(true);
    try {
      const r = await api("PATCH /api/me", { language });
      setOverride(r.me);
      // pages using useRequireMe cancel the event and update in place; others get a reload
      if (window.dispatchEvent(new CustomEvent(ME_CHANGED, { detail: r.me, cancelable: true }))) location.reload();
    } catch { /* language stays; the picker simply does not move */ }
    setBusy(false);
  }
  async function out() { await signOut(); router.replace("/"); }

  const links: { href: string; label: string }[] = me
    ? [{ href: "/inbox", label: t("nav.inbox") }, ...(me.role === "supervisor" ? [{ href: "/tasks", label: t("nav.tasks") }, { href: "/insights", label: t("b.nav.insights") }, { href: "/crew", label: t("nav.crew") }] : [])]
    : [];

  return (
    <>
      <header className="sticky top-0 z-20 border-b-[2.5px] border-ink bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {back && (
              <Link href={back} aria-label={t("nav.back")} className="inline-flex min-h-12 min-w-12 items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M27 16 L5 16 M14 6 L5 16 L14 26" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            )}
            {title ? <h1 className="truncate font-display text-lg font-extrabold leading-tight">{title}</h1> : <Brand href={me ? "/inbox" : "/"} />}
          </div>
          {me && <LanguagePicker value={me.language} onChange={setLang} label={t("nav.language")} busy={busy} />}
        </div>
        {me && (
          <nav aria-label="main" className={cx("mx-auto max-w-5xl flex-wrap items-center gap-x-1 px-3 pb-1", back ? "hidden sm:flex" : "flex")}>
            {links.map((l) => (
              <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}
                className={cx("inline-flex min-h-12 items-center px-3 font-display text-base font-extrabold", path.startsWith(l.href) && "underline decoration-pen decoration-4 underline-offset-4")}>
                {l.label}
              </Link>
            ))}
            <span className="ml-auto flex items-center gap-1">
              <span className="hidden max-w-[9rem] truncate font-hand text-lg sm:inline lg:max-w-[20rem]" title={`${me.display_name} · ${t(`role.${me.role}`)}`}>{me.display_name} · {t(`role.${me.role}`)}</span>
              <button type="button" onClick={out} className="inline-flex min-h-12 items-center px-2 text-base font-semibold text-pen underline underline-offset-4">{t("nav.signout")}</button>
            </span>
          </nav>
        )}
      </header>
      {me && <BetaNote lang={me.language} t={t} />}
      {me?.is_sandbox && (
        <div role="note" className="border-b-[2.5px] border-ink bg-warn-soft px-4 py-1 text-center font-hand text-base text-ink">
          {t("nav.sandbox")}
        </div>
      )}
    </>
  );
}
