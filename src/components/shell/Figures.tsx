// Hand-drawn stick figures and step icons. Lines only, 4px strokes.
export function Stick({ hat, size = 44, color = "var(--ink)" }: { hat?: boolean; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="13" r="7" stroke={color} strokeWidth={4} />
      {hat && <path d="M14 11 C15 3, 33 3, 34 11 M12 11 H36" stroke={color} strokeWidth={4} strokeLinecap="round" />}
      <path d="M24 20 V34 M10 26 C16 24, 20 24, 24 25 C28 24, 32 24, 38 26 M24 34 L15 45 M24 34 L33 45" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEP_D = [
  "M5 6 H27 V20 H15 L9 27 V20 H5 Z",
  "M6 4 H26 V28 H6 Z M11 11 H21 M11 16 H21 M11 21 H17",
  "M6 12 H26 M6 20 H26 M21 5 L11 27",
  "M5 17 C8 19, 10 22, 12 25 C16 15, 22 9, 28 5",
];
export function StepIcon({ n, size = 36 }: { n: 0 | 1 | 2 | 3; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <path d={STEP_D[n]} pathLength={1} className="draw" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
