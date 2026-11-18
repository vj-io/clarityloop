// Safety briefing check: loading and the DTO in the reader's language (redacted for workers).
import { compareBriefing, rollCallView, type RollItem } from "../briefing.ts";
import { inLang, type BriefingDTO, type BriefingReplyDTO, type BriefingState, type I18n, type Lang } from "../types.ts";
import type { ProfileRow } from "./auth.ts";
import { memberConversation } from "./conversations.ts";
import { labelsOf, safetyPoints, type LabelCols } from "./crew.ts";
import { db, ok } from "./db.ts";
import { notFound } from "./http.ts";
import { pickI18n } from "./tasks.ts";

export type BriefingRowDb = {
  id: string; crew_id: string; conversation_id: string; supervisor_id: string;
  point_ids: string[]; place_id: string | null; note: string | null; note_i18n: I18n;
  is_sandbox: boolean; created_at: string;
};
export type AttemptDb = {
  at: string; text: string; language: Lang; said: string[]; unreadable: boolean;
  gloss: I18n; model_id: string | null; ms: number | null;
};
export type ReplyRowDb = {
  id: string; briefing_id: string; worker_id: string; conversation_id: string; state: BriefingState;
  original_text: string | null; language: Lang | null; said_point_ids: string[]; gloss: I18n;
  model_id: string | null; ms: number | null; attempts: AttemptDb[];
  created_at: string; updated_at: string; understood_at: string | null;
};
type Person = { id: string; display_name: string; language: Lang };

/** The briefing, if `me` is a member of its crew channel; 404 otherwise. */
export async function loadBriefing(id: string, me: ProfileRow): Promise<BriefingRowDb> {
  const b = ok(await db().from("briefings").select("*").eq("id", id).maybeSingle()) as BriefingRowDb | null;
  if (!b) return notFound();
  await memberConversation(b.conversation_id, me.id);
  return b;
}

export async function briefingDTO(b: BriefingRowDb, reader: ProfileRow): Promise<BriefingDTO> {
  const lang = reader.language;
  const [points, reps, place] = await Promise.all([
    safetyPoints(b.crew_id, true),
    db().from("briefing_replies").select("*").eq("briefing_id", b.id),
    b.place_id ? db().from("site_places").select("label_en, label_hi, label_ta, labels_beta").eq("id", b.place_id).maybeSingle() : Promise.resolve(null),
  ]);
  const replies = ok(reps) as ReplyRowDb[];
  const ppl = ok(await db().from("profiles").select("id, display_name, language").in("id", [b.supervisor_id, ...replies.map((r) => r.worker_id)])) as Person[];
  const people = new Map(ppl.map((p) => [p.id, p]));
  const who = (id: string) => { const p = people.get(id); return { id, name: p?.display_name ?? "", language: p?.language ?? ("en" as Lang) }; };
  const byId = new Map(points.map((p) => [p.id, p]));
  const labelOf = (id: string) => inLang(byId.get(id)?.labels ?? { en: "", hi: "", ta: "" }, lang);

  const items: RollItem[] = replies.map((r) => {
    const c = compareBriefing(b.point_ids, r.said_point_ids);
    return { worker: who(r.worker_id), state: r.state, conversation_id: r.conversation_id, said: c.said, missing: c.missing };
  });
  const view = rollCallView(items, { id: reader.id, role: reader.role });
  const visible = reader.role === "supervisor" ? replies : replies.filter((r) => r.worker_id === reader.id);
  const dtoReplies: BriefingReplyDTO[] = visible.map((r) => {
    const c = compareBriefing(b.point_ids, r.said_point_ids);
    return {
      worker: who(r.worker_id), conversation_id: r.conversation_id, state: r.state, understood_at: r.understood_at,
      said: c.said, missing: c.missing, extra: c.extra,
      attempts: (r.attempts ?? []).map((a) => ({
        at: a.at, text: a.text, language: a.language, said_point_ids: a.said, unreadable: a.unreadable,
        gloss: a.unreadable ? null : pickI18n(a.gloss, lang, "") || null,
      })),
    };
  }).sort((x, y) => x.worker.name.localeCompare(y.worker.name));
  const picked = new Set(b.point_ids);
  const others = [...new Set(visible.flatMap((r) => [...r.said_point_ids, ...(r.attempts ?? []).flatMap((a) => a.said)]))].filter((id) => !picked.has(id));
  const pl = place ? (ok(place) as LabelCols | null) : null;
  const sup = who(b.supervisor_id);
  return {
    id: b.id, conversation_id: b.conversation_id, created_at: b.created_at, is_sandbox: b.is_sandbox,
    supervisor: sup,
    points: b.point_ids.map((id) => ({ id, label: labelOf(id), labels: byId.get(id)?.labels ?? { en: "", hi: "", ta: "" } })),
    other_points: others.map((id) => ({ id, label: labelOf(id) })),
    place: pl ? inLang(labelsOf(pl), lang) : null,
    note: b.note == null ? null : pickI18n(b.note_i18n, lang, b.note),
    ...view,
    replies: dtoReplies,
  };
}
