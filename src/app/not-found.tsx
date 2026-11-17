"use client";
import { Card, Screen } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { LinkButton, PublicHeader } from "@/components/shell/Common";

export default function NotFound() {
  const { lang, setLang, t } = usePublicLang();
  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      <Screen>
        <Card className="mt-6 flex flex-col items-center gap-4 text-center">
          <svg width="132" height="104" viewBox="0 0 132 104" fill="none" aria-hidden="true">
            <path d="M14 88 H118" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
            <path d="M22 80 C30 30, 44 22, 56 52 C62 66, 70 66, 76 52 C86 24, 100 30, 110 80" stroke="var(--pen)" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 9" />
            <path d="M52 18 C58 8, 74 8, 80 18 C84 26, 74 30, 68 36 M68 46 V48" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p className="font-mono text-4xl font-bold">404</p>
          <h1 className="font-display text-2xl font-extrabold leading-tight">{t("nf.title")}</h1>
          <p className="text-lg leading-snug">{t("nf.body")}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <LinkButton href="/" tone="ink">{t("judge.home")}</LinkButton>
            <LinkButton href="/judge" tone="hi">{t("land.cta")}</LinkButton>
          </div>
        </Card>
      </Screen>
    </>
  );
}
