// Crew tasks ("broadcasts"): one instruction, one ordinary task per worker, one roll-call board.
import { FIELDS, type BroadcastDTO, type FieldMarks, type I18n, type Lang, type TaskState } from "../types.ts";
import { localUnit } from "../units.ts";
import type { ProfileRow } from "./auth.ts";
import { boardView, type BoardItem } from "./board.ts";
import { memberConversation } from "./conversations.ts";
import { crewLists } from "./crew.ts";
import { db, ok } from "./db.ts";
import { notFound } from "./http.ts";
import { label, pickI18n } from "./tasks.ts";

export type BroadcastRowDb = {
  id: string; crew_id: string; conversation_id: string; supervisor_id: string;
  action_id: string; object_text: string; object_i18n: I18n; place_id: string; due_time: string;
  quantity: number | string | null; unit: string | null; note: string | null; note_i18n: I18n;
  is_safety: boolean; is_sandbox: boolean; created_at: string;
};
type Child = { id: string; conversation_id: string; worker_id: string; state: TaskState };

/** The broadcast, if `me` is a member of its crew channel; 404 otherwise. */
export async function loadBroadcast(id: string, me: ProfileRow): Promise<BroadcastRowDb> {
  const b = ok(await db().from("broadcasts").select("*").eq("id", id).maybeSingle()) as BroadcastRowDb | null;
  if (!b) return notFound();
  await memberConversation(b.conversation_id, me.id);
  return b;
}

export async function broadcastDTO(b: BroadcastRowDb, reader: ProfileRow): Promise<BroadcastDTO> {
  const lang = reader.language;
  const [lists, kids, sup] = await Promise.all([
    crewLists(b.crew_id),
    db().from("tasks").select("id, conversation_id, worker_id, state").eq("broadcast_id", b.id),
    db().from("profiles").select("display_name").eq("id", b.supervisor_id).single(),
  ]);
  const children = ok(kids) as Child[];
  const open = children.filter((c) => c.state === "mismatch" || c.state === "needs_look").map((c) => c.id);
  const [ppl, cks] = await Promise.all([
    children.length ? db().from("profiles").select("id, display_name, language").in("id", children.map((c) => c.worker_id)) : Promise.resolve({ data: [], error: null }),
    open.length ? db().from("checks").select("task_id, field_marks, created_at").in("task_id", open).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  const people = new Map((ok(ppl) as { id: string; display_name: string; language: Lang }[]).map((p) => [p.id, p]));
  const latest = new Map<string, FieldMarks>();
  for (const c of ok(cks) as { task_id: string; field_marks: FieldMarks }[]) if (!latest.has(c.task_id)) latest.set(c.task_id, c.field_marks);

  const show = (field: string, v: string | null, who: "supervisor" | "worker") =>
    field === "action" ? label(lists, "actions", v, lang)
    : field === "place" ? label(lists, "places", v, lang)
    : field === "object" && who === "supervisor" ? pickI18n(b.object_i18n, lang, b.object_text)
    : v ?? "";
  const items: BoardItem[] = children.map((c) => {
    const p = people.get(c.worker_id);
    const marks = latest.get(c.id);
    return {
      worker: { id: c.worker_id, name: p?.display_name ?? "", language: p?.language ?? "en" },
      task_id: c.id, conversation_id: c.conversation_id, state: c.state,
      issues: !marks ? [] : FIELDS.filter((f) => marks[f].mark === "mismatch" || (marks[f].mark === "unclear" && !marks[f].accepted))
        .map((f) => ({ field: f, mark: marks[f].mark, supervisor: show(f, marks[f].supervisor, "supervisor"), worker: show(f, marks[f].worker, "worker") })),
    };
  });
  const view = boardView(items, { id: reader.id, role: reader.role });
  return {
    id: b.id, conversation_id: b.conversation_id, created_at: b.created_at, is_safety: b.is_safety, is_sandbox: b.is_sandbox,
    action: label(lists, "actions", b.action_id, lang), object: pickI18n(b.object_i18n, lang, b.object_text),
    place: label(lists, "places", b.place_id, lang), due_time: b.due_time,
    quantity: b.quantity == null ? null : Number(b.quantity), unit: localUnit(b.unit, lang),
    note: b.note == null ? null : pickI18n(b.note_i18n, lang, b.note),
    supervisor: { id: b.supervisor_id, name: (ok(sup) as { display_name: string }).display_name },
    ...view,
  };
}
