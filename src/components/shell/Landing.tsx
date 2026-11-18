"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, Hl, Pill } from "@/components/ui";
import type { T } from "@/lib/i18n";
import { usePublicLang } from "./lang";
import { LinkButton, PublicHeader, Section, Squiggle } from "./Common";
import { DemoLoop } from "./DemoLoop";
import { Stick, StepIcon } from "./Figures";

const SOURCES = [
  { k: "land.ev1", href: "https://emerald.com/insight/content/doi/10.1108/ECAM-02-2022-0129/full/html", who: "Guan et al., 2022" },
  { k: "land.ev2", href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10751618", who: "Meeral et al., 2023" },
  { k: "land.ev3", href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6590951", who: "Yen & Leasure, 2019" },
];
const BUYERS = [1, 2, 3, 4] as const;
const PHASES = ["now", "pilot", "site", "scale"] as const;
const PLANS = ["free", "pro", "ent"] as const;
const WHO = [["ravi", false], ["murugan", true], ["manager", false]] as const;
const TODAY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const NEXCONN_KEY = "qd46yzrfq1obf";
const linkCls = "inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4";

/** Shown when a signed-out visitor was sent here from a page that needs an account (guard.ts adds ?signin=1). */
function SignInNotice({ t }: { t: T }) {
  if (!useSearchParams().has("signin")) return null;
  return (
    <div role="status" className="doodle doodle-flat mb-6 bg-pen-soft! px-4 py-3">
      <p className="text-lg leading-snug">{t("land.signin")}</p>
      <p className="flex flex-wrap gap-x-5"><Link href="/judge" className={linkCls}>{t("land.cta")}</Link><Link href="/login" className={linkCls}>{t("land.supervisor")}</Link></p>
    </div>
  );
}

export function Landing() {
  const { lang, setLang, t } = usePublicLang();
  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 [overflow-wrap:anywhere]">
        <Suspense><SignInNotice t={t} /></Suspense>
        {/* Hero: claim, promise, one big button, honest notes + the demo case */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[1.1fr_1fr] md:items-start">
          <div>
            <p className="inline-block -rotate-1 rounded-lg border-2 border-ink bg-card px-3 py-1 font-hand text-lg">{t("land.eyebrow")}</p>
            <h1 className={`mt-3 font-display font-extrabold md:text-6xl ${lang === "en" ? "text-[2.6rem] leading-[1.05]" : "text-[2.1rem] leading-[1.2]"}`}>
              {t("land.h1a")}<Hl>{t("land.h1b")}</Hl>{t("land.h1c")}
            </h1>
            <p className="mt-4 text-lg leading-snug">{t("land.promise")}</p>
            <div className="mt-5 flex flex-col items-start gap-1">
              <LinkButton href="/judge" tone="hi" className="min-h-14 w-full text-lg sm:w-auto">{t("land.cta")}</LinkButton>
              <p className="font-hand text-base text-muted">{t("land.ctaSub")}</p>
            </div>
            <p className="mt-3 text-base leading-snug">{t("land.nexconn")} <code className="font-mono font-bold">{NEXCONN_KEY}</code></p>
            <ul className="mt-4 space-y-1 font-hand text-lg leading-snug">
              {["land.note1", "land.note2", "land.note3"].map((k) => (
                <li key={k} className="flex gap-2"><span aria-hidden="true" className="text-pen">&#x270E;</span><span>{t(k)}</span></li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-5 text-base">
              <Link href="/login" className={linkCls}>{t("land.supervisor")}</Link>
              <Link href="/join" className={linkCls}>{t("land.worker")}</Link>
            </p>
          </div>
          <DemoLoop t={t} />
        </div>

        <Section title={t("land.todayTitle")}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {TODAY.map((n) => (
              <li key={n} className="doodle doodle-flat flex min-h-12 items-center gap-2 bg-card px-3 py-2 font-display text-base font-extrabold leading-tight">
                <span aria-hidden="true" className="text-ok">&#x2713;</span>{t(`land.today${n}`)}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("land.layersTitle")}>
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="-rotate-1">
              <p className="font-hand text-lg text-pen">{t("land.l1k")}</p>
              <h3 className="font-display text-xl font-extrabold">{t("land.l1t")}</h3>
              <p className="mt-2">{t("land.l1b")}</p>
            </Card>
            <Card className="rotate-1 bg-pen-soft!">
              <p className="font-hand text-lg text-pen">{t("land.l2k")}</p>
              <h3 className="font-display text-xl font-extrabold">{t("land.l2t")}</h3>
              <p className="mt-2">{t("land.l2b")}</p>
            </Card>
          </div>
        </Section>

        <Section title={t("land.howTitle")}>
          <ol className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {([0, 1, 2, 3] as const).map((n) => (
              <li key={n} className="doodle flex gap-3 p-3">
                <StepIcon n={n} />
                <div>
                  <p className="font-display text-lg font-extrabold leading-tight"><span className="font-mono">{n + 1}</span> · {t(`land.s${n + 1}t`)}</p>
                  <p className="mt-1 leading-snug">{t(`land.s${n + 1}b`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title={t("b.land.bigTitle")}>
          <p className="mb-3 font-hand text-lg text-muted">{t("land.evSub")}</p>
          <ul className="grid gap-3 md:grid-cols-3">
            {SOURCES.map((s) => (
              <li key={s.k} className="rounded-xl border-2 border-dashed border-ink bg-card p-3">
                <p className="leading-snug">{t(s.k)}</p>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className={`${linkCls} mt-1`}>{s.who} &#x2197;</a>
              </li>
            ))}
          </ul>
          <p className="mt-3"><Link href="/results" className={linkCls}>{t("b.land.resultsLink")} &#x2192;</Link></p>
        </Section>

        <Section title={t("land.whoTitle")}>
          <div className="grid gap-4 sm:grid-cols-3">
            {WHO.map(([k, hat]) => (
              <div key={k} className="doodle flex items-start gap-3 p-3">
                <Stick hat={hat} />
                <div>
                  <p className="font-display text-lg font-extrabold leading-tight">{t(`land.who_${k}`)}</p>
                  <p className="mt-1 leading-snug">{t(`land.who_${k}_b`)}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("b.land.payTitle")}>
          <p className="mb-3">{t("b.land.paySub")}</p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {BUYERS.map((n) => (
              <li key={n} className="doodle p-3">
                <h3 className="font-display text-lg font-extrabold leading-tight">{t(`b.land.pay${n}`)}</h3>
                <p className="mt-1 leading-snug">{t(`b.land.pay${n}b`)}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={<>{t("land.plansTitle")} <Pill tint="warn">{t("b.land.draftPriced")}</Pill></>}>
          <p className="mb-3">{t("land.plansSub")}</p>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <Card key={p}>
                <h3 className="font-display text-xl font-extrabold">{t(`land.p_${p}`)}</h3>
                <p className="font-hand text-lg text-muted">{t(`land.p_${p}_for`)}</p>
                <p className="mt-2 leading-snug">{t(`land.p_${p}_b`)}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section title={t("b.land.growTitle")}>
          <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {BUYERS.map((n) => (
              <li key={n} className="rounded-xl border-2 border-dashed border-ink bg-card p-3">
                <h3 className="font-display text-lg font-extrabold leading-tight">{t(`b.land.grow${n}`)}</h3>
                <p className="mt-1 leading-snug">{t(`b.land.grow${n}b`)}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("land.roadTitle")}>
          <ol className="relative ml-3 space-y-4 border-l-4 border-ink pl-6">
            {PHASES.map((p, i) => (
              <li key={p} className="relative">
                <span aria-hidden="true" className={`absolute -left-[2.3rem] top-1 h-5 w-5 rounded-full border-[3px] border-ink ${i === 0 ? "bg-ink" : "bg-card"}`} />
                <p className="font-display text-lg font-extrabold leading-tight">{t(`land.r_${p}`)}{i === 0 && <> <Pill tint="ok"><span className="text-[#0f6b31]">{t("land.r_built")}</span></Pill></>}</p>
                <p className="leading-snug">{t(`land.r_${p}_b`)}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Squiggle />
        <footer className="space-y-2">
          <p className="font-hand text-lg">{t("land.foot")}</p>
          <p className="flex flex-wrap gap-x-5 text-base">
            <Link href="/judge" className={linkCls}>{t("land.cta")}</Link>
            <Link href="/login" className={linkCls}>{t("land.supervisor")}</Link>
            <Link href="/join" className={linkCls}>{t("land.worker")}</Link>
            <Link href="/results" className={linkCls}>{t("land.results")}</Link>
            <a href="https://github.com/vj-io/clarityloop" className={linkCls}>GitHub</a>
          </p>
          <p className="font-hand text-lg">{t("land.team")}</p>
        </footer>
      </main>
    </>
  );
}
