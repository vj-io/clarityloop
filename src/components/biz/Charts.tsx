// Plain inline SVG charts in the doodle style. Strokes >= 3px; every colour also has a text label next to it.
import type { Lang } from "@/lib/types";
import { dayLabel } from "./fmt";

/** One horizontal bar: two stacked shares (bad = mismatch, warn = unclear) or one violet share. Values are whole percents of the track. */
export function HBar({ parts, hi }: { parts: { pct: number; color: string }[]; hi?: boolean }) {
  const shown = parts.filter((p) => p.pct > 0).map((p) => ({ ...p, pct: Math.max(p.pct, 3) }));
  return (
    <svg width="100%" height="26" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true" className="block">
      <rect x="1" y="3" width="98" height="20" rx="2.5" ry="7" fill={hi ? "var(--hi)" : "var(--card)"} stroke="var(--ink)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      {shown.map((p, i) => {
        const x = shown.slice(0, i).reduce((a, q) => a + q.pct, 0);
        return <rect key={i} x={3 + x * 0.94} y="7" width={Math.min(p.pct, 100 - x) * 0.94} height="12" rx="1.5" ry="5" fill={p.color} />;
      })}
    </svg>
  );
}

/** 14 days: ink-outlined bar = tasks sent; lime bar inside = understood on the first try. */
export function TrendChart({ days, lang, label }: { days: { date: string; sent: number; first_try: number }[]; lang: Lang; label: string }) {
  const W = 320, H = 150, L = 26, B = 24, T = 10, plotH = H - B - T;
  const max = Math.max(4, ...days.map((d) => d.sent));
  const slot = (W - L - 4) / days.length;
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mx-auto block h-auto w-full max-w-xl">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth="1.5" />
          <text x={L - 5} y={y(v) + 4} textAnchor="end" fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)">{v}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + 3 + i * slot;
        const w = slot - 6;
        return (
          <g key={d.date}>
            {d.sent > 0 && <rect x={x} y={y(d.sent)} width={w} height={T + plotH - y(d.sent)} rx="3" fill="var(--card)" stroke="var(--ink)" strokeWidth="3" />}
            {d.first_try > 0 && <rect x={x + 3} y={y(d.first_try)} width={w - 6} height={T + plotH - y(d.first_try) - 3} rx="2" fill="var(--hi)" />}
          </g>
        );
      })}
      <line x1={L} x2={W} y1={T + plotH} y2={T + plotH} stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      {[0, 6, 13].map((i) => (
        <text key={i} x={L + 3 + i * slot + (slot - 6) / 2} y={H - 6} textAnchor={i === 0 ? "start" : i === 13 ? "end" : "middle"} fontSize="11" fontFamily="var(--font-mono)" fill="var(--ink)">
          {dayLabel(days[i].date, lang)}
        </text>
      ))}
    </svg>
  );
}
