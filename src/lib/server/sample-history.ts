// Sample history for the judge sandbox, so Insights, Tasks and Records have something to show on a
// fresh visit. It is written only into the sandbox crew, every row is flagged is_sandbox, and the
// Insights page says so. The marks are not hand-written: each sample reply is turned into fields here
// and then compared by the same compareFields() the live app uses.
import { randomUUID } from "node:crypto";
import { compareFields, overallOf } from "../compare.ts";
import type { Extraction, Lang, TaskFields } from "../types.ts";
import { db, ok } from "./db.ts";

/** `ex` holds only what differs from the task; place is a list index, or null for "not mentioned". */
type Reply = { text: string; ex: Omit<Partial<Extraction>, "place"> & { gloss_en: string; place?: number | null }; afterMin: number };
type Sample = {
  who: "murugan" | "lakshmi"; daysAgo: number; hour: number;
  action: number; place: number; object: [string, string, string]; due: string; qty: number | null; unit: string | null;
  replies: Reply[]; done: boolean;
};

// action index: 0 Unload 1 Move 2 Clean 3 Fix 4 Deliver · place index: 0..3 Gate 1..4, 4 Store room
const S: Sample[] = [
  { who: "murugan", daysAgo: 9, hour: 8, action: 0, place: 0, object: ["sand bags", "रेत की बोरियाँ", "மணல் மூட்டைகள்"], due: "09:00", qty: 30, unit: "bags", done: true,
    replies: [{ text: "30 bori ret Gate 1 pe utaarni hai subah 9 baje", ex: { time: "09:00", gloss_en: "Unload 30 sand bags at Gate 1 at 9 in the morning." }, afterMin: 3 }] },
  { who: "lakshmi", daysAgo: 9, hour: 10, action: 2, place: 4, object: ["store room floor", "स्टोर रूम का फ़र्श", "ஸ்டோர் ரூம் தரை"], due: "11:30", qty: null, unit: null, done: true,
    replies: [{ text: "ஸ்டோர் ரூம் தரையை 11:30 மணிக்குள் சுத்தம் செய்ய வேண்டும்", ex: { time: "11:30", quantity: null, unit: null, gloss_en: "Clean the store room floor by 11:30." }, afterMin: 4 }] },
  { who: "murugan", daysAgo: 8, hour: 9, action: 1, place: 2, object: ["steel rods", "सरिया", "இரும்புக் கம்பிகள்"], due: "15:00", qty: 20, unit: "rods", done: true,
    replies: [
      { text: "20 sariya Gate 2 pe le jaana hai 3 baje tak", ex: { place: 1, time: "03:00", time_ambiguous: true, gloss_en: "Move 20 steel rods to Gate 2 by 3 o'clock." }, afterMin: 2 },
      { text: "20 sariya Gate 3 pe le jaana hai 3 baje tak", ex: { time: "03:00", time_ambiguous: true, gloss_en: "Move 20 steel rods to Gate 3 by 3 o'clock." }, afterMin: 6 },
    ] },
  { who: "lakshmi", daysAgo: 7, hour: 7, action: 0, place: 3, object: ["bricks", "ईंटें", "செங்கற்கள்"], due: "08:00", qty: 500, unit: "bricks", done: true,
    replies: [
      { text: "கேட் 4-ல் 50 செங்கற்களை காலை 8 மணிக்கு இறக்க வேண்டும்", ex: { time: "08:00", quantity: 50, gloss_en: "Unload 50 bricks at Gate 4 at 8 in the morning." }, afterMin: 5 },
      { text: "கேட் 4-ல் 500 செங்கற்களை காலை 8 மணிக்கு இறக்க வேண்டும்", ex: { time: "08:00", gloss_en: "Unload 500 bricks at Gate 4 at 8 in the morning." }, afterMin: 9 },
    ] },
  { who: "murugan", daysAgo: 6, hour: 13, action: 4, place: 4, object: ["paint drums", "पेंट के ड्रम", "பெயிண்ட் டிரம்கள்"], due: "16:00", qty: 6, unit: "drums", done: true,
    replies: [{ text: "6 drum paint store room mein pahunchana hai shaam 4 baje tak", ex: { time: "16:00", gloss_en: "Deliver 6 paint drums to the store room by 4 in the evening." }, afterMin: 3 }] },
  { who: "murugan", daysAgo: 5, hour: 8, action: 3, place: 1, object: ["water pipe", "पानी की पाइप", "தண்ணீர் குழாய்"], due: "10:00", qty: null, unit: null, done: true,
    replies: [
      { text: "pipe theek karni hai 10 baje", ex: { place: null, time: "10:00", time_ambiguous: true, quantity: null, unit: null, object: "pipe", object_maybe_same: true, gloss_en: "Fix the pipe at 10 o'clock." }, afterMin: 2 },
      { text: "Gate 2 ki paani ki pipe subah 10 baje tak theek karni hai", ex: { time: "10:00", quantity: null, unit: null, gloss_en: "Fix the water pipe at Gate 2 by 10 in the morning." }, afterMin: 7 },
    ] },
  { who: "lakshmi", daysAgo: 4, hour: 9, action: 1, place: 0, object: ["cement bags", "सीमेंट की बोरियाँ", "சிமெண்ட் மூட்டைகள்"], due: "14:00", qty: 25, unit: "bags", done: true,
    replies: [
      { text: "25 சிமெண்ட் மூட்டைகளை கேட் 1-க்கு காலை 2 மணிக்கு நகர்த்த வேண்டும்", ex: { time: "02:00", gloss_en: "Move 25 cement bags to Gate 1 at 2 in the morning." }, afterMin: 4 },
      { text: "25 சிமெண்ட் மூட்டைகளை கேட் 1-க்கு மதியம் 2 மணிக்கு நகர்த்த வேண்டும்", ex: { time: "14:00", gloss_en: "Move 25 cement bags to Gate 1 at 2 in the afternoon." }, afterMin: 8 },
    ] },
  { who: "murugan", daysAgo: 3, hour: 10, action: 0, place: 2, object: ["tiles", "टाइलें", "டைல்ஸ்"], due: "12:00", qty: 80, unit: "boxes", done: true,
    replies: [{ text: "80 dabbe tiles Gate 3 pe utaarne hain dopahar 12 baje tak", ex: { time: "12:00", unit: "boxes", gloss_en: "Unload 80 boxes of tiles at Gate 3 by 12 noon." }, afterMin: 3 }] },
  { who: "lakshmi", daysAgo: 2, hour: 15, action: 2, place: 2, object: ["scaffolding area", "मचान का इलाक़ा", "சாரக்கட்டு பகுதி"], due: "17:00", qty: null, unit: null, done: true,
    replies: [{ text: "கேட் 3 சாரக்கட்டு பகுதியை மாலை 5 மணிக்குள் சுத்தம் செய்ய வேண்டும்", ex: { time: "17:00", quantity: null, unit: null, gloss_en: "Clean the scaffolding area at Gate 3 by 5 in the evening." }, afterMin: 5 }] },
  { who: "murugan", daysAgo: 1, hour: 9, action: 4, place: 3, object: ["safety helmets", "सेफ़्टी हेलमेट", "பாதுகாப்பு தலைக்கவசங்கள்"], due: "09:30", qty: 12, unit: "helmets", done: false,
    replies: [
      { text: "12 helmet Gate 1 pe pahunchane hain 9:30 baje", ex: { place: 0, time: "09:30", gloss_en: "Deliver 12 safety helmets to Gate 1 at 9:30." }, afterMin: 2 },
      { text: "12 helmet Gate 4 pe pahunchane hain subah 9:30 baje", ex: { time: "09:30", gloss_en: "Deliver 12 safety helmets to Gate 4 at 9:30 in the morning." }, afterMin: 5 },
    ] },
];

const LANG: Record<Sample["who"], Lang> = { murugan: "hi", lakshmi: "ta" };

type Ids = {
  supervisorId: string; workers: Record<Sample["who"], { id: string; conversationId: string }>;
  placeId: (i: number) => string; actionId: (i: number) => string;
};
type Row = Record<string, unknown>;

/** Pure: the rows to insert. Throws if a sample's last reply does not match (a broken sample). */
export function buildSampleRows(o: Ids, now = new Date()): { tasks: Row[]; rests: Row[]; checks: Row[]; confirmations: Row[] } {
  const tasks: Row[] = [], rests: Row[] = [], checks: Row[] = [], confirmations: Row[] = [];
  for (const s of S) {
    const w = o.workers[s.who];
    const created = new Date(now); created.setDate(created.getDate() - s.daysAgo); created.setHours(s.hour, 5, 0, 0);
    const at = (min: number) => new Date(created.getTime() + min * 60_000).toISOString();
    const fields: TaskFields = { action_id: o.actionId(s.action), object_en: s.object[0], place_id: o.placeId(s.place), due_time: s.due, quantity: s.qty, unit: s.unit };
    const taskId = randomUUID();
    let last = "waiting", lastMin = 0;
    for (const r of s.replies) {
      const { place, ...rest } = r.ex;
      const ex: Extraction = {
        action: fields.action_id, object: s.object[0], object_maybe_same: false,
        time: s.due, time_ambiguous: false, quantity: s.qty, unit: s.unit, ...rest,
        place: place === null ? "unknown" : place === undefined ? fields.place_id : o.placeId(place),
      };
      const marks = compareFields(fields, ex);
      const restId = randomUUID();
      rests.push({ id: restId, task_id: taskId, worker_id: w.id, original_text: r.text, language: LANG[s.who], created_at: at(r.afterMin) });
      checks.push({ id: randomUUID(), restatement_id: restId, task_id: taskId, extracted: ex, field_marks: marks, overall: overallOf(marks), gloss: { en: r.ex.gloss_en }, model_id: "sample", ms: 1500, created_at: at(r.afterMin) });
      last = overallOf(marks); lastMin = r.afterMin;
    }
    if (last !== "all_match") throw new Error(`sample history: last reply must match (${s.object[0]}: ${last})`);
    const understood = at(lastMin + 1);
    tasks.push({
      id: taskId, conversation_id: w.conversationId, supervisor_id: o.supervisorId, worker_id: w.id,
      action_id: fields.action_id, object_text: s.object[0], object_i18n: { en: s.object[0], hi: s.object[1], ta: s.object[2] },
      place_id: fields.place_id, due_time: s.due, quantity: s.qty, unit: s.unit, note: null, note_i18n: {},
      state: s.done ? "done" : "understood", is_sandbox: true, created_at: created.toISOString(),
      seen_at: at(1), understood_at: understood, done_at: s.done ? at(lastMin + 90) : null,
    });
    confirmations.push({ task_id: taskId, profile_id: w.id, confirmed_at: understood }, { task_id: taskId, profile_id: o.supervisorId, confirmed_at: understood });
  }
  return { tasks, rests, checks, confirmations };
}

export async function seedSampleHistory(o: Ids) {
  const r = buildSampleRows(o);
  ok(await db().from("tasks").insert(r.tasks).select("id"));
  ok(await db().from("restatements").insert(r.rests).select("id"));
  ok(await db().from("checks").insert(r.checks).select("id"));
  ok(await db().from("task_confirmations").insert(r.confirmations).select("task_id"));
  return r.tasks.length;
}
