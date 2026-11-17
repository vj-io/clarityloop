"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, MarkIcon, Screen } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { PageLoading, PublicHeader } from "@/components/shell/Common";
import type { T } from "@/lib/i18n";

type Model = {
  model: string;
  translation?: { total?: number; kept_ok?: number; median_ms?: number; p90_ms?: number };
  meaning?: { total?: number; planted?: number; caught?: number; false_alarms?: number; median_ms?: number };
};
type Results = { ran_at?: string; models: Model[] };
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Only well-formed entries survive; anything else is dropped rather than guessed. */
function parse(raw: unknown): Results | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { ran_at?: unknown; models?: unknown };
  if (!Array.isArray(r.models)) return null;
  const models = r.models.filter((m): m is Model => !!m && typeof m === "object" && typeof (m as Model).model === "string");
  return models.length ? { ran_at: typeof r.ran_at === "string" ? r.ran_at : undefined, models } : null;
}

function Metric({ t, label, value, target, pass }: { t: T; label: string; value: string; target: string; pass: boolean | null }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span className="min-w-0"><span className="block font-semibold leading-tight">{label}</span><span className="block font-hand text-base text-muted">{t("res.target")}: {target}</span></span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-lg font-bold">{value}</span>
        {pass !== null && <span className={`flex items-center gap-1 text-sm font-semibold ${pass ? "text-ok" : "text-bad"}`}><MarkIcon mark={pass ? "match" : "mismatch"} size={16} />{t(pass ? "res.meets" : "res.below")}</span>}
      </span>
    </li>
  );
}

export default function ResultsPage() {
  const { lang, setLang, t } = usePublicLang();
  const [data, setData] = useState<Results | null | undefined>(undefined);
  useEffect(() => {
    fetch("/evals-results.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(parse(j)))
      .catch(() => setData(null));
  }, []);

  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      <Screen>
        <h1 className="font-display text-3xl font-extrabold leading-tight">{t("res.title")}</h1>
        <p className="mt-1 text-lg leading-snug">{t("res.sub")}</p>
        <div className="mt-5 space-y-5">
          {data === undefined && <PageLoading t={t} />}
          {data === null && (
            <Card className="bg-warn-soft!">
              <p className="font-display text-xl font-extrabold">{t("res.none")}</p>
              <p className="mt-1 leading-snug">{t("res.noneB")}</p>
            </Card>
          )}
          {data && data.models.map((m) => {
            const tr = m.translation, mm = m.meaning;
            return (
              <Card key={m.model}>
                <h2 className="break-all font-mono text-lg font-bold">{m.model}</h2>
                {data.ran_at && <p className="font-hand text-base text-muted">{t("res.ran")}: {new Date(data.ran_at).toLocaleString()}</p>}
                <ul className="mt-2 divide-y-2 divide-dashed divide-ink/30">
                  {tr && isNum(tr.total) && isNum(tr.kept_ok) && tr.total > 0 && (
                    <Metric t={t} label={t("res.trans")} value={`${tr.kept_ok} / ${tr.total}`} target={t("res.all")} pass={tr.kept_ok === tr.total} />
                  )}
                  {tr && isNum(tr.median_ms) && (
                    <Metric t={t} label={t("res.transMs")} value={`${Math.round(tr.median_ms)} ms`} target="< 1500 ms" pass={tr.median_ms < 1500} />
                  )}
                  {mm && isNum(mm.planted) && isNum(mm.caught) && (
                    <Metric t={t} label={t("res.caught")} value={`${mm.caught} / ${mm.planted}`} target={t("res.all")} pass={mm.caught === mm.planted} />
                  )}
                  {mm && isNum(mm.false_alarms) && (
                    <Metric t={t} label={t("res.false")} value={String(mm.false_alarms)} target="<= 1" pass={mm.false_alarms <= 1} />
                  )}
                  {mm && isNum(mm.median_ms) && (
                    <Metric t={t} label={t("res.meanMs")} value={`${Math.round(mm.median_ms)} ms`} target="< 5000 ms" pass={mm.median_ms < 5000} />
                  )}
                  {tr && isNum(tr.p90_ms) && <Metric t={t} label={t("res.p90")} value={`${Math.round(tr.p90_ms)} ms`} target="-" pass={null} />}
                </ul>
              </Card>
            );
          })}
          <Card>
            <h2 className="font-display text-xl font-extrabold">{t("res.targets")}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-snug">
              {["res.t1", "res.t2", "res.t3"].map((k) => <li key={k}>{t(k)}</li>)}
            </ul>
          </Card>
          <Link href="/" className="inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4">{t("judge.home")}</Link>
        </div>
      </Screen>
    </>
  );
}
