// Task state = icon + word + colour (never colour alone).
import type { TaskState } from "@/lib/types";
import type { T } from "@/lib/i18n";
import { MarkIcon, Pill } from "@/components/ui";

const TINT: Record<TaskState, "ok" | "warn" | "bad" | "pen" | "ghost"> = {
  waiting: "ghost", checking: "pen", mismatch: "bad", needs_look: "warn", all_match: "ok", understood: "ok", done: "ghost",
};

function Glyph({ state }: { state: TaskState }) {
  if (state === "mismatch") return <MarkIcon mark="mismatch" size={16} />;
  if (state === "needs_look") return <MarkIcon mark="unclear" size={16} />;
  if (state === "all_match" || state === "understood") return <MarkIcon mark="match" size={16} />;
  const d = state === "waiting" ? "M16 5 V16 L23 21" : state === "checking" ? "M5 16 C5 8, 14 5, 20 9 M27 16 C27 24, 18 27, 12 23" : "M4 17 L12 25 L28 7";
  const c = state === "checking" ? "var(--pen)" : "var(--ink)";
  return <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d={d} stroke={c} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function TaskStatePill({ state, t }: { state: TaskState; t: T }) {
  return <Pill tint={TINT[state]}><Glyph state={state} />{t(`state.${state}`)}</Pill>;
}
