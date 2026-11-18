"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, adoptGrant, api } from "@/lib/client/session";
import { LanguageGrid } from "@/components/shell/LanguagePicker";
import { Field, Input, Screen } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { Btn, PublicHeader, cx, errMsg } from "@/components/shell/Common";
import type { T } from "@/lib/i18n";

function joinErr(e: unknown, t: T, back: boolean): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return t(back ? "join.e404b" : "join.e404");
    if (e.status === 409) return t("join.e409");
    if (e.status === 401) return t("join.e401");
    if (e.status === 423) return t("join.e423");
  }
  return errMsg(e, t);
}

function Inner() {
  const { lang, setLang, t } = usePublicLang();
  const router = useRouter();
  const [code, setCode] = useState((useSearchParams().get("code") ?? "").toUpperCase().slice(0, 12));
  const [back, setBack] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = { join_code: code.trim().toUpperCase(), name: name.trim(), pin };
      const grant = back ? await api("POST /api/worker-login", body) : await api("POST /api/join", { ...body, language: lang });
      await adoptGrant(grant);
      router.replace("/inbox");
    } catch (x) { setErr(joinErr(x, t, back)); setBusy(false); }
  }
  const ready = code.trim().length >= 4 && name.trim().length > 0 && /^\d{4}$/.test(pin);

  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      <Screen>
        <h1 className="font-display text-3xl font-extrabold leading-tight">{t("join.title")}</h1>
        <p className="mt-2 text-lg leading-snug">{t("join.sub")}</p>

        <div role="group" aria-label={t("join.title")} className="mt-4 grid grid-cols-2 gap-2">
          {[false, true].map((b) => (
            <button key={String(b)} type="button" aria-pressed={back === b} onClick={() => { setBack(b); setErr(null); }}
              className={cx("min-h-12 rounded-xl border-2 border-ink px-2 font-display text-base font-extrabold", back === b ? "bg-ink text-paper" : "bg-card")}>
              {t(b ? "join.back" : "join.new")}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label={t("join.code")} hint={t("join.codeHint")}>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              className="text-center font-mono text-2xl font-bold tracking-[0.25em]" placeholder="XXXXXX" />
          </Field>
          <Field label={t("join.name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
          </Field>
          {!back && (
            <fieldset>
              <legend className="font-hand text-lg leading-tight">{t("join.lang")}</legend>
              <LanguageGrid value={lang} onChange={setLang} t={t} />
            </fieldset>
          )}
          <Field label={t("join.pin")} hint={t(back ? "join.pinHintBack" : "join.pinHint")} error={err}>
            <Input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete={back ? "current-password" : "new-password"}
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className="text-center font-mono text-2xl tracking-[0.5em]" placeholder="••••" />
          </Field>
          <Btn type="submit" tone="hi" disabled={busy || !ready} className="min-h-14 w-full text-lg">{busy ? t("common.wait") : t(back ? "join.goBack" : "join.go")}</Btn>
        </form>

        <p className="mt-6 font-hand text-lg leading-snug">{t("join.privacy")}</p>
        <div className="mt-3 flex flex-col border-t-2 border-dashed border-ink pt-2">
          <Link href="/login" className="inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4">{t("join.supervisor")}</Link>
        </div>
      </Screen>
    </>
  );
}

export default function JoinPage() {
  return <Suspense><Inner /></Suspense>;
}
