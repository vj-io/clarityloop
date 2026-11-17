// Read-only numbers for /insights and the task record for /record/:id. Nothing here writes or calls AI.
import { FIELDS, type CheckRow, type FieldKey, type FieldMarks, type InsightsDTO, type Lang, type Overall, type RecordDTO, type TaskState } from "../types.ts";
import type { ProfileRow } from "./auth.ts";
import { crewLists } from "./crew.ts";
import { db, ok } from "./db.ts";
import { forbidden } from "./http.ts";
import type { CheckDbRow, TaskRow } from "./tasks.ts";

export type InTask = { id: string; worker_id: string; object_text: string; state: TaskState; created_at: string; understood_at: string | null };
export type InRestatement = { task_id: string };
export type InCheck = { task_id: string; overall: Overall; field_marks: Partial<FieldMarks> | null; created_at: string };
export type InWorker = { id: string; display_name: string; language: Lang };

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((100 * a) / b));
const isUnderstood = (s: TaskState) => s === "understood" || s === "done";
const IST_MS = 5.5 * 3600_000;   // ponytail: fixed IST day buckets (the pilot market); per-crew time zone if sites outside India join
const dayKey = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);

/** Pure: every dashboard number is defined here. `now` is injected so the test is deterministic. */
export function computeInsights(
  tasks: InTask[], restatements: InRestatement[], checks: InCheck[], workers: InWorker[],
  crew: InsightsDTO["crew"], now: number,
): InsightsDTO {
  const restCount = new Map<string, number>();
  for (const r of restatements) restCount.set(r.task_id, (restCount.get(r.task_id) ?? 0) + 1);
  const first = new Map<string, InCheck>();   // earliest check per task
  for (const c of checks) {
    const f = first.get(c.task_id);
    if (!f || c.created_at < f.created_at) first.set(c.task_id, c);
  }
  const rc = (t: InTask) => restCount.get(t.id) ?? 0;
  const person = new Map(workers.map((w) => [w.id, w]));

  const understood = tasks.filter((t) => isUnderstood(t.state));
  const restated = tasks.filter((t) => rc(t) >= 1).length;
  const caught = understood.filter((t) => { const f = first.get(t.id); return f && f.overall !== "all_match"; }).length;
  const mins = tasks.filter((t) => t.understood_at).map((t) => (Date.parse(t.understood_at!) - Date.parse(t.created_at)) / 60000).sort((a, b) => a - b);
  const median = mins.length === 0 ? null : Math.round(((mins[(mins.length - 1) >> 1] + mins[mins.length >> 1]) / 2) * 10) / 10;

  const fields = FIELDS.map((field: FieldKey) => {
    let checked = 0, mismatch = 0, unclear = 0;
    for (const f of first.values()) {
      const m = f.field_marks?.[field]?.mark;
      if (!m) continue;
      checked++;
      if (m === "mismatch") mismatch++;
      else if (m === "unclear") unclear++;
    }
    return { field, checked, mismatch, unclear };
  });

  const languages = (["en", "hi", "ta"] as Lang[]).flatMap((language) => {
    const own = tasks.filter((t) => person.get(t.worker_id)?.language === language);
    if (own.length === 0) return [];
    const retried = own.filter((t) => rc(t) >= 2).length;
    return [{ language, tasks: own.length, retried, retried_pct: pct(retried, own.length) }];
  });

  const workerRows = workers.flatMap((w) => {
    const own = tasks.filter((t) => t.worker_id === w.id);
    return own.length ? [{ id: w.id, name: w.display_name, language: w.language, tasks: own.length, retried: own.filter((t) => rc(t) >= 2).length }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));

  const today = Date.parse(dayKey(now));
  const trend = Array.from({ length: 14 }, (_, i) => ({ date: dayKey(today - (13 - i) * 86400_000), sent: 0, first_try: 0 }));
  const byDate = new Map(trend.map((d) => [d.date, d]));
  for (const t of tasks) {
    const d = byDate.get(dayKey(Date.parse(t.created_at)));
    if (!d) continue;
    d.sent++;
    if (isUnderstood(t.state) && first.get(t.id)?.overall === "all_match") d.first_try++;
  }

  const recent = [...tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map((t) => ({
    id: t.id, object: t.object_text, worker: person.get(t.worker_id)?.display_name ?? "", state: t.state, created_at: t.created_at, restatements: rc(t),
  }));

  return {
    crew, generated_at: new Date(now).toISOString(),
    totals: {
      sent: tasks.length, restated, restated_pct: pct(restated, tasks.length),
      understood: understood.length, understood_pct: pct(understood.length, tasks.length),
      checked: first.size, caught, median_minutes_to_understood: median,
    },
    fields, languages, workers: workerRows, trend, recent,
  };
}

/** All rows of a select, in pages (PostgREST returns at most 1000 per request). */
async function pages<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = ok(await q(from, from + 999)) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** The supervisor's own crew only: 403 for anyone who is not that crew's supervisor. */
export async function loadInsights(me: ProfileRow): Promise<InsightsDTO> {
  if (!me.crew_id) return forbidden();
  const crew = ok(await db().from("crews").select("name, site_name, is_sandbox, supervisor_id").eq("id", me.crew_id).maybeSingle()) as
    { name: string; site_name: string; is_sandbox: boolean; supervisor_id: string } | null;
  if (!crew || crew.supervisor_id !== me.id) return forbidden();

  const convIds = (ok(await db().from("conversations").select("id").eq("crew_id", me.crew_id)) as { id: string }[]).map((c) => c.id);
  const tasks = (await Promise.all(chunks(convIds, 100).map((ids) =>
    pages<InTask & { worker_id: string }>((a, b) => db().from("tasks")
      .select("id, worker_id, object_text, state, created_at, understood_at").in("conversation_id", ids).order("created_at").range(a, b))))).flat();
  const ids = tasks.map((t) => t.id);
  const [restatements, checks, workers] = await Promise.all([
    Promise.all(chunks(ids, 100).map((c) => pages<InRestatement>((a, b) => db().from("restatements").select("task_id").in("task_id", c).order("created_at").range(a, b)))).then((x) => x.flat()),
    Promise.all(chunks(ids, 100).map((c) => pages<InCheck>((a, b) => db().from("checks").select("task_id, overall, field_marks, created_at").in("task_id", c).order("created_at").range(a, b)))).then((x) => x.flat()),
    db().from("profiles").select("id, display_name, language").eq("crew_id", me.crew_id).then((r) => ok(r) as InWorker[]),
  ]);
  return computeInsights(tasks, restatements, checks, workers, { name: crew.name, site_name: crew.site_name, is_sandbox: crew.is_sandbox }, Date.now());
}

type Person = { id: string; display_name: string; language: Lang };

/** The audit trail of one task. Reader's language where a translation already exists; never triggers a translation. */
export async function loadRecord(task: TaskRow, crewId: string, reader: ProfileRow): Promise<RecordDTO> {
  const [lists, rests, checks, confs, events] = await Promise.all([
    crewLists(crewId),
    db().from("restatements").select("id, worker_id, original_text, language, created_at").eq("task_id", task.id).order("created_at"),
    db().from("checks").select("*").eq("task_id", task.id).order("created_at"),
    db().from("task_confirmations").select("profile_id, confirmed_at").eq("task_id", task.id).order("confirmed_at"),
    db().from("audit_events").select("id, actor_id, type, payload, created_at").eq("task_id", task.id).order("created_at"),
  ]);
  const restRows = ok(rests) as { id: string; worker_id: string; original_text: string; language: Lang; created_at: string }[];
  const checkRows = ok(checks) as CheckDbRow[];
  const confRows = ok(confs) as { profile_id: string; confirmed_at: string }[];
  const evRows = ok(events) as { id: string; actor_id: string | null; type: string; payload: Record<string, unknown>; created_at: string }[];
  const accs = checkRows.length
    ? ok(await db().from("field_acceptances").select("check_id, field, accepted_by, created_at").in("check_id", checkRows.map((c) => c.id)).order("created_at")) as
      { check_id: string; field: FieldKey; accepted_by: string; created_at: string }[]
    : [];
  const pids = [...new Set([task.supervisor_id, task.worker_id, ...restRows.map((r) => r.worker_id), ...confRows.map((c) => c.profile_id), ...accs.map((a) => a.accepted_by), ...evRows.flatMap((e) => (e.actor_id ? [e.actor_id] : []))])];
  const people = new Map((ok(await db().from("profiles").select("id, display_name, language").in("id", pids)) as Person[]).map((p) => [p.id, p]));
  const name = (id: string) => people.get(id)?.display_name ?? "";
  const sup = people.get(task.supervisor_id);
  const lang = reader.language;
  const srcLang = sup?.language ?? "en";

  const lab = (kind: "actions" | "places", id: string | null, l: Lang) => (id == null ? "" : lists[kind].find((x) => x.id === id)?.labels[l] ?? id);
  const pick = (v: Partial<Record<Lang, string>>, l: Lang, fb: string) => v[l] ?? v.en ?? fb;
  const rows = (c: CheckDbRow): CheckRow[] => FIELDS.map((field) => {
    const m = c.field_marks[field];
    const show = (v: string | null, who: "supervisor" | "worker") =>
      field === "action" ? lab("actions", v, lang) : field === "place" ? lab("places", v, lang)
      : field === "object" && who === "supervisor" ? pick(task.object_i18n, lang, task.object_text) : v ?? "";
    return { field, mark: m.mark, supervisor: show(m.supervisor, "supervisor"), worker: show(m.worker, "worker"), ...(m.reason ? { reason: m.reason } : {}), ...(m.accepted ? { accepted: true } : {}) };
  });

  return {
    task: {
      id: task.id, state: task.state, is_sandbox: task.is_sandbox, created_at: task.created_at, understood_at: task.understood_at, done_at: task.done_at,
      due_time: task.due_time, quantity: task.quantity == null ? null : Number(task.quantity), unit: task.unit,
      supervisor: { id: task.supervisor_id, name: name(task.supervisor_id), language: srcLang },
      worker: { id: task.worker_id, name: name(task.worker_id), language: people.get(task.worker_id)?.language ?? "en" },
      reader: {
        action: lab("actions", task.action_id, lang), object: pick(task.object_i18n, lang, task.object_text), place: lab("places", task.place_id, lang),
        note: task.note == null ? null : pick(task.note_i18n, lang, task.note),
      },
      original: { language: srcLang, action: lab("actions", task.action_id, srcLang), object: task.object_text, place: lab("places", task.place_id, srcLang), note: task.note },
    },
    restatements: restRows.map((r) => {
      const own = checkRows.filter((c) => c.restatement_id === r.id);
      const stored = own.map((c) => c.restatement_i18n?.[lang]).find((x) => typeof x === "string") ?? null;
      return {
        id: r.id, created_at: r.created_at, by: name(r.worker_id), language: r.language, text: r.original_text,
        translated: r.language === lang ? null : stored,
        checks: own.map((c) => ({
          id: c.id, overall: c.overall, created_at: c.created_at, unreadable: c.extracted == null, rows: rows(c), gloss: pick(c.gloss, lang, ""),
          accepted: accs.filter((a) => a.check_id === c.id).map((a) => ({ field: a.field, by: name(a.accepted_by), at: a.created_at })),
        })),
      };
    }),
    confirmations: confRows.map((c) => ({ by: name(c.profile_id), at: c.confirmed_at })),
    events: evRows.map((e) => ({
      id: e.id, type: e.type, by: e.actor_id ? name(e.actor_id) : null, at: e.created_at,
      detail: Object.entries(e.payload ?? {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · "),
    })),
  };
}
