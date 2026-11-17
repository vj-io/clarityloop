// Hand-drawn strokes for the conversation screen. Lines only; each path draws itself (class "draw").
const P = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function ClipboardDoodle({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <path {...P} d="M9 6 C7 6, 6 7, 6 9 L6.5 27 C6.5 28.5, 7.5 29, 9 29 L23 28.6 C24.6 28.6, 25.4 27.8, 25.3 26 L25 9 C25 7, 24 6, 22.5 6" stroke="currentColor" strokeWidth={3} pathLength={1} className="draw" />
      <path {...P} d="M11.5 3.8 L20.5 4 L20.8 8.6 L11.3 8.5 Z" stroke="currentColor" strokeWidth={3} />
      <path {...P} d="M10.5 15 L12.5 17.5 L15.5 13 M18 15.5 L22 15.3 M10.5 22.5 L21.5 22.2" stroke="currentColor" strokeWidth={2.6} pathLength={1} className="draw" />
    </svg>
  );
}

/** Paper-plane-ish arrow for the send button. */
export function SendDoodle() {
  return (
    <svg width={26} height={26} viewBox="0 0 32 32" aria-hidden="true">
      <path {...P} d="M4 15 C12 12, 20 8, 28 4 C25 12, 21 20, 17 28 C16 23, 14.5 19, 13 17 C10 16.5, 7 16, 4 15 Z M13 17 L27.5 4.5" stroke="currentColor" strokeWidth={3} />
    </svg>
  );
}

/** Hand-drawn "≠" for a mismatched row. */
export function NotEqual() {
  return (
    <svg width={30} height={26} viewBox="0 0 30 26" aria-hidden="true" className="shrink-0">
      <path {...P} d="M4 10 C11 9, 18 10.5, 26 9.5 M4 17 C11 16, 19 17.5, 26 16.5 M19 3 C17 10, 14 17, 11 23" stroke="var(--bad)" strokeWidth={3.2} pathLength={1} className="draw" />
    </svg>
  );
}

/** Red marker underline under the worker's mismatched value. */
export function MarkerUnderline() {
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" className="absolute -bottom-1.5 left-0 h-2.5 w-full">
      <path {...P} d="M2 6 C20 3, 40 8, 60 5 S88 3, 98 6" stroke="var(--bad)" strokeWidth={4} pathLength={1} className="draw" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The big drawn check of the Understood card. */
export function BigCheck() {
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" aria-hidden="true" className="shrink-0">
      <path {...P} d="M36 5 C53 4, 67 17, 67 35 C67 53, 54 67, 36 67 C18 67, 5 54, 5 36 C5 21, 15 8, 31 5.5" stroke="var(--ok)" strokeWidth={3.5} pathLength={1} className="draw" />
      <path {...P} d="M20 37 C24 41, 28 45, 32 51 C38 38, 46 27, 56 19" stroke="var(--ok)" strokeWidth={6} pathLength={1} className="draw" style={{ animationDelay: "0.35s" }} />
    </svg>
  );
}

/** Two speech bubbles crossing languages: empty-state doodle. */
export function HelloDoodle() {
  return (
    <svg width={150} height={92} viewBox="0 0 150 92" aria-hidden="true">
      <path {...P} d="M10 12 C30 7, 58 8, 72 12 C76 22, 75 36, 70 44 C55 47, 38 47, 27 45 L16 56 L18 44 C12 42, 8 40, 8 34 C7 26, 8 18, 10 12 Z" stroke="var(--ink)" strokeWidth={3} pathLength={1} className="draw" />
      <path {...P} d="M20 24 L60 23 M20 33 L48 32.5" stroke="var(--ink)" strokeWidth={3} pathLength={1} className="draw" />
      <path {...P} d="M82 34 C100 30, 128 31, 142 35 C145 45, 144 58, 140 66 C132 68, 124 68, 118 68 L130 82 L110 68 C98 69, 88 68, 82 66 C79 56, 79 44, 82 34 Z" fill="var(--pen-soft)" stroke="var(--pen)" strokeWidth={3} />
      <path {...P} d="M92 47 L132 46 M92 56 L118 55.5" stroke="var(--pen)" strokeWidth={3} />
      <path {...P} d="M66 60 C72 70, 80 74, 90 76 M84 70 L91 76 L84 81" stroke="var(--ink)" strokeWidth={2.6} pathLength={1} className="draw" />
    </svg>
  );
}

/** Hand-drawn speech-bubble tail. `side` = which bottom corner it hangs from. */
export function Tail({ side, fill }: { side: "left" | "right"; fill: string }) {
  return (
    <svg width={18} height={14} viewBox="0 0 18 14" aria-hidden="true"
      className={`absolute -bottom-[11px] ${side === "left" ? "left-3" : "right-3 -scale-x-100"}`}>
      <path {...P} d="M1 0.5 C3 5, 2.5 9, 0.5 13 C6.5 10.5, 11 6.5, 14 0.5" fill={fill} stroke="var(--ink)" strokeWidth={2.5} />
      <path d="M2.2 -1 L13 -1 L12.5 1.6 L2.4 1.6 Z" fill={fill} />
    </svg>
  );
}
