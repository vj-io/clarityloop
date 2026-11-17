"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe } from "@/lib/client/session";
import { LANGS, LANG_NAME } from "@/lib/types";
import { Field, Input, Screen } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { Btn, PageLoading, PublicHeader, cx, errMsg } from "@/components/shell/Common";

export default function OnboardingPage() {
  const { lang, setLang, t } = usePublicLang();
  const router = useRouter();
  const { me, needsOnboarding } = useMe();
  const [name, setName] = useState("");
  const [crew, setCrew] = useState("");
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (me === undefined) return;
    if (me) router.replace("/inbox");          // already has a profile
    else if (!needsOnboarding) router.replace("/login");
  }, [me, needsOnboarding, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("POST /api/crews", { display_name: name.trim(), language: lang, crew_name: crew.trim(), site_name: site.trim() });
      router.replace("/crew");
    } catch (x) { setErr(errMsg(x, t)); setBusy(false); }
  }
  if (!needsOnboarding) return <><PublicHeader lang={lang} setLang={setLang} t={t} /><PageLoading t={t} /></>;

  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      <Screen>
        <h1 className="font-display text-3xl font-extrabold leading-tight">{t("onb.title")}</h1>
        <p className="mt-2 text-lg leading-snug">{t("onb.sub")}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label={t("onb.name")}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} /></Field>
          <fieldset>
            <legend className="font-hand text-lg leading-tight">{t("onb.lang")}</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {LANGS.map((l) => (
                <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}
                  className={cx("doodle doodle-flat min-h-14 px-1 text-lg font-bold", lang === l ? "bg-hi!" : "bg-card")}>
                  {lang === l && <span aria-hidden="true">&#10003; </span>}{LANG_NAME[l]}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={t("onb.crew")} hint={t("onb.crewHint")}><Input value={crew} onChange={(e) => setCrew(e.target.value)} maxLength={60} /></Field>
          <Field label={t("onb.site")} hint={t("onb.siteHint")} error={err}><Input value={site} onChange={(e) => setSite(e.target.value)} maxLength={60} /></Field>
          <Btn type="submit" tone="hi" disabled={busy || !name.trim() || !crew.trim() || !site.trim()} className="min-h-14 w-full text-lg">{busy ? t("common.wait") : t("onb.go")}</Btn>
        </form>
      </Screen>
    </>
  );
}
