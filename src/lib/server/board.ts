// Roll-call board: pure logic, no I/O (unit-tested in src/lib/board.test.ts).
import type { BoardRow, BoardStatus, FieldKey, Lang, Mark, TaskState } from "../types.ts";

export type BoardItem = {
  worker: { id: string; name: string; language: Lang };
  task_id: string; conversation_id: string; state: TaskState;
  /** fields of the latest check that block confirmation (mismatch, or unclear and not accepted), already labelled */
  issues: { field: FieldKey; mark: Mark; supervisor: string; worker: string }[];
};

const DONE: TaskState[] = ["understood", "done"];
export const isUnderstood = (s: TaskState) => DONE.includes(s);

/**
 * Rows in the reader's view plus the progress count. The supervisor sees everything. A worker sees
 * their own row in full and every other row only as "understood" or "not_yet".
 */
export function boardView(items: BoardItem[], reader: { id: string; role: "supervisor" | "worker" }): {
  rows: BoardRow[]; progress: { understood: number; total: number }; redacted: boolean;
} {
  const redacted = reader.role !== "supervisor";
  const rows = [...items]
    .sort((a, b) => a.worker.name.localeCompare(b.worker.name))
    .map((it): BoardRow => {
      const is_me = it.worker.id === reader.id;
      if (redacted && !is_me) {
        const status: BoardStatus = isUnderstood(it.state) ? "understood" : "not_yet";
        return { worker: it.worker, status, is_me, task_id: null, conversation_id: null, issues: [] };
      }
      return { worker: it.worker, status: it.state, is_me, task_id: it.task_id, conversation_id: it.conversation_id, issues: it.issues };
    });
  if (redacted) rows.sort((a, b) => Number(b.is_me) - Number(a.is_me)); // my own row first
  return { rows, progress: { understood: items.filter((i) => isUnderstood(i.state)).length, total: items.length }, redacted };
}
