"use client";
// Self-playing demo case from the PRD worked example. Pure HTML/SVG; honours reduced motion.
import { useEffect, useState } from "react";
import type { T } from "@/lib/i18n";
import type { FieldKey, Mark } from "@/lib/types";
import { MarkIcon } from "@/components/ui";
import { cx } from "./Common";
import { Stick } from "./Figures";

const ROWS: { f: FieldKey; sup: string; wrk: string; mark: Mark }[] = [
  { f: "action", sup: "demo.unload", wrk: "demo.unload", mark: "match" },
  { f: "object", sup: "demo.cement", wrk: "demo.cement", mark: "match" },
  { f: "place", sup: "demo.gate3", wrk: "demo.gate2", mark: "mismatch" },
  { f: "time", sup: "demo.time", wrk: "demo.time", mark: "match" },
  { f: "quantity", sup: "demo.qty", wrk: "demo.qty", mark: "match" },
];
const LAST = 9; // 0 task, 1 reply, 2..6 rows, 7 banner, 8 hold, 9 hold
const tone: Record<Mark, string> = { match: "text-ok", mismatch: "text-bad font-bold", unclear: "text-warn" };

export function DemoLoop({ t }: { t: T }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: show the finished state once
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStep(LAST); return; }
    const id = setInterval(() => setStep((s) => (s >= LAST + 2 ? 0 : s + 1)), 1100);
    return () => clearInterval(id);
  }, []);
  const s = Math.min(step, LAST);

  return (
    <figure className="doodle -rotate-1 bg-card p-3" aria-label={t("land.demoLabel")}>
      <div className="flex items-start gap-2">
        <Stick size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-hand text-base text-muted">{t("demo.ravi")}</p>
          <div className="doodle doodle-flat bg-card px-3 py-2">
            <p className="font-hand text-sm text-muted">{t("demo.sends")}</p>
            <p className="flex flex-wrap gap-x-2 font-display text-base font-extrabold leading-snug">{["demo.unload", "demo.cement", "demo.gate3", "demo.time", "demo.qty"].map((k) => <span key={k} className="whitespace-nowrap">{t(k)}</span>)}</p>
          </div>
        </div>
      </div>

      <div className={cx("mt-3 flex items-start justify-end gap-2 transition-opacity duration-300", s >= 1 ? "opacity-100" : "opacity-0")}>
        <div className="min-w-0 flex-1 text-right">
          <p className="font-hand text-base text-muted">{t("demo.murugan")}</p>
          <div className="doodle doodle-flat inline-block max-w-full bg-pen-soft! px-3 py-2 text-left">
            <p className="font-hand text-sm text-muted">{t("demo.replies")}</p>
            <p lang="hi-Latn" className="text-base leading-snug">&ldquo;40 bori cement Gate 2 pe utaarna hai, 2 baje tak&rdquo;</p>
          </div>
        </div>
        <Stick hat size={40} color="var(--pen)" />
      </div>

      <ul className="mt-3 min-h-[18.5rem]" aria-live="off">
        {ROWS.map((r, i) => {
          const vis = s >= 2 + i;
          if (!vis) return <li key={r.f} className="mb-1 h-14" aria-hidden="true" />;
          return (
            <li key={r.f} className={cx("pop mb-1 flex items-center gap-2 rounded-lg border-2 border-ink px-2 py-1", r.mark === "mismatch" ? "bg-bad-soft" : "bg-ok-soft")}>
              <MarkIcon mark={r.mark} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold leading-tight">{t(`f.${r.f}`)}</span>
                <span className={cx("block text-sm leading-tight", tone[r.mark])}>{t(`mark.${r.mark}`)}</span>
              </span>
              <span className="w-[5.2rem] break-words text-right text-sm leading-tight">{t(r.sup)}</span>
              <span className={cx("w-[5.2rem] break-words text-right text-sm leading-tight", r.mark === "mismatch" && "font-bold text-bad")}>{t(r.wrk)}</span>
            </li>
          );
        })}
      </ul>

      <div className={cx("rounded-lg border-2 border-ink bg-bad px-3 py-2 text-center font-display text-base font-extrabold text-white transition-opacity duration-300", s >= 7 ? "opacity-100" : "opacity-0")}>
        {t("demo.blocked")}
      </div>
      <figcaption className="mt-2 text-center font-hand text-lg leading-tight">{t("demo.caption")}</figcaption>
    </figure>
  );
}
