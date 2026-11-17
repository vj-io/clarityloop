// Task / check loading and DTOs in the reader's language (FR-11, FR-15).
import {
  FIELDS, LANGS, type CheckDTO, type CheckRow, type FieldMarks, type I18n, type Lang,
  type Overall, type Role, type TaskDTO, type TaskState,
} from "../types.ts";
import { translateText, type CrewLists } from "./ai.ts";
import type { ProfileRow } from "./auth.ts";
import { memberConversation, type ConvRow } from "./conversations.ts";
import { crewLists } from "./crew.ts";
import { audit, db, logHealth, ok } from "./db.ts";
import { notFound } from "./http.ts";

export type TaskRow = {
  id: string; conversation_id: string; supervisor_id: string; worker_id: string;
  action_id: string; object_text: string; object_i18n: I18n; place_id: string; due_time: string;
  quantity: number | string | null; unit: string | null; note: string | null; note_i18n: I18n;
  state: TaskState; is_sandbox: boolean; created_at: string; understood_at: string | null; done_at: string | null;
};
export type CheckDbRow = {
  id: string; restatement_id: string; task_id: string; extracted: unknown; field_marks: FieldMarks;
  overall: Overall; gloss: I18n; restatement_i18n: Partial<Record<Lang, string | null>>; created_at: string;
};
type Person = { id: string; display_name: string; language: Lang; role: Role };

/** Translate into all three languages; any failure keeps the original text in that slot. */
export async function i18nAll(text: string, src: Lang, lists: CrewLists): Promise<Record<Lang, string>> {
  const out = { en: text, hi: text, ta: text };
  await Promise.all(LANGS.filter((l) => l !== src).map(async (l) => {
    const t0 = Date.now();
    try {
      out[l] = (await translateText(text, l, lists))?.text ?? text;
      await logHealth("translate", true, null, Date.now() - t0);
    } catch {
      await logHealth("translate", false, "ai_error", Date.now() - t0);
    }
  }));
  return out;
}

/** The task, if `me` is a member of its conversation; 404 otherwise. */
export async function loadTask(taskId: string, me: ProfileRow): Promise<{ task: TaskRow; conv: ConvRow }> {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return notFound();
  const task = ok(await db().from("tasks").select("*").eq("id", taskId).maybeSingle()) as TaskRow | null;
  if (!task) return notFound();
  return { task, conv: await memberConversation(task.conversation_id, me.id) };
}

export async function setState(task: TaskRow, state: TaskState, actor: string, type: string, payload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const [u] = await Promise.all([
    db().from("tasks").update({ state, ...extra }).eq("id", task.id),
    audit(task.id, actor, type, { from: task.state, to: state, ...payload }),
  ]);
  ok(u);
  task.state = state;
  Object.assign(task, extra);
}

type Ctx = { lists: CrewLists; people: Record<string, Person> };

async function context(task: TaskRow, conv: ConvRow): Promise<Ctx> {
  const [lists, ppl] = await Promise.all([
    crewLists(conv.crew_id),
    db().from("profiles").select("id, display_name, language, role").in("id", [task.supervisor_id, task.worker_id]),
  ]);
  return { lists, people: Object.fromEntries((ok(ppl) as Person[]).map((p) => [p.id, p])) };
}

const label = (lists: CrewLists, kind: "places" | "actions", id: string | null, lang: Lang) =>
  id == null ? "" : lists[kind].find((x) => x.id === id)?.labels[lang] ?? id;
const pickI18n = (v: I18n, lang: Lang, fallback: string) => v[lang] ?? v.en ?? fallback;

async function checkDTO(check: CheckDbRow, task: TaskRow, reader: ProfileRow, cx: Ctx): Promise<CheckDTO> {
  const lang = reader.language;
  const rows: CheckRow[] = FIELDS.map((field) => {
    const m = check.field_marks[field];
    const show = (v: string | null, who: "supervisor" | "worker") =>
      field === "action" ? label(cx.lists, "actions", v, lang)
      : field === "place" ? label(cx.lists, "places", v, lang)
      : field === "object" && who === "supervisor" ? pickI18n(task.object_i18n, lang, task.object_text)
      : v ?? "";
    return {
      field, mark: m.mark, supervisor: show(m.supervisor, "supervisor"), worker: show(m.worker, "worker"),
      ...(m.reason ? { reason: m.reason } : {}), ...(m.accepted ? { accepted: true } : {}),
    };
  });
  const r = ok(await db().from("restatements").select("original_text, language").eq("id", check.restatement_id).single()) as { original_text: string; language: Lang };

  // Restatement in the reader's language, made once and kept on the check.
  let translated: string | null = null;
  if (r.language !== lang) {
    if (lang in check.restatement_i18n) translated = check.restatement_i18n[lang] ?? null;
    else {
      const t0 = Date.now();
      try {
        translated = (await translateText(r.original_text, lang, cx.lists))?.text ?? null;
        check.restatement_i18n = { ...check.restatement_i18n, [lang]: translated };
        await db().from("checks").update({ restatement_i18n: check.restatement_i18n }).eq("id", check.id);
        await logHealth("translate", true, null, Date.now() - t0);
      } catch {
        await logHealth("translate", false, "ai_error", Date.now() - t0);
      }
    }
  }
  const otherId = reader.id === task.supervisor_id ? task.worker_id : task.supervisor_id;
  const otherLang = cx.people[otherId]?.language ?? "en";
  return {
    id: check.id, task_id: task.id, overall: check.overall, created_at: check.created_at, rows,
    restatement: { text: r.original_text, language: r.language, translated },
    gloss: pickI18n(check.gloss, lang, ""), gloss_other: pickI18n(check.gloss, otherLang, ""),
    unreadable: check.extracted == null,
  };
}

export async function latestCheck(taskId: string): Promise<CheckDbRow | null> {
  return ok(await db().from("checks").select("*").eq("task_id", taskId).order("created_at", { ascending: false }).limit(1).maybeSingle()) as CheckDbRow | null;
}

export async function taskDTO(task: TaskRow, conv: ConvRow, reader: ProfileRow, check?: CheckDbRow | null): Promise<TaskDTO> {
  const lang = reader.language;
  const [cx, confs, latest] = await Promise.all([
    context(task, conv),
    db().from("task_confirmations").select("profile_id, confirmed_at").eq("task_id", task.id).order("confirmed_at"),
    check === undefined ? latestCheck(task.id) : Promise.resolve(check),
  ]);
  const name = (id: string) => ({ id, name: cx.people[id]?.display_name ?? "" });
  return {
    id: task.id, conversation_id: task.conversation_id, state: task.state, is_sandbox: task.is_sandbox, created_at: task.created_at,
    action: label(cx.lists, "actions", task.action_id, lang), object: pickI18n(task.object_i18n, lang, task.object_text),
    place: label(cx.lists, "places", task.place_id, lang), due_time: task.due_time,
    quantity: task.quantity == null ? null : Number(task.quantity), unit: task.unit,
    note: task.note == null ? null : pickI18n(task.note_i18n, lang, task.note),
    supervisor: name(task.supervisor_id), worker: name(task.worker_id),
    confirmations: ok(confs) as { profile_id: string; confirmed_at: string }[],
    latest_check: latest ? await checkDTO(latest, task, reader, cx) : null,
    understood_at: task.understood_at, done_at: task.done_at,
  };
}

export async function checkView(checkId: string, reader: ProfileRow): Promise<{ check: CheckDTO; task: TaskDTO }> {
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) return notFound();
  const check = ok(await db().from("checks").select("*").eq("id", checkId).maybeSingle()) as CheckDbRow | null;
  if (!check) return notFound();
  const { task, conv } = await loadTask(check.task_id, reader);
  const cx = await context(task, conv);
  return { check: await checkDTO(check, task, reader, cx), task: await taskDTO(task, conv, reader) };
}

