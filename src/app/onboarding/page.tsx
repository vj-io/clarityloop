"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe } from "@/lib/client/session";
import { LanguageGrid } from "@/components/shell/LanguagePicker";
import { Field, Input, Screen } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { Btn, PageLoading, PublicHeader, errMsg } from "@/components/shell/Common";

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
            <LanguageGrid value={lang} onChange={setLang} t={t} />
          </fieldset>
          <Field label={t("onb.crew")} hint={t("onb.crewHint")}><Input value={crew} onChange={(e) => setCrew(e.target.value)} maxLength={60} /></Field>
          <Field label={t("onb.site")} hint={t("onb.siteHint")} error={err}><Input value={site} onChange={(e) => setSite(e.target.value)} maxLength={60} /></Field>
          <Btn type="submit" tone="hi" disabled={busy || !name.trim() || !crew.trim() || !site.trim()} className="min-h-14 w-full text-lg">{busy ? t("common.wait") : t("onb.go")}</Btn>
        </form>
      </Screen>
    </>
  );
}
