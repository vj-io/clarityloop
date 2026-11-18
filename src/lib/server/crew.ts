// Crews and their place/action lists (FR-3).
import { randomInt } from "node:crypto";
import { BETA_LANGS, inLang, type BetaLang, type CrewDTO, type Labels, type Lang, type ListItem, type Role } from "../types.ts";
import type { CrewLists, LabelledItem } from "./ai.ts";
import { db, ok } from "./db.ts";
import { DEFAULT_ACTIONS, DEFAULT_PLACES, type SeedItem } from "./seed.ts";
import { DEFAULT_SAFETY_POINTS } from "../briefing.ts";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const newJoinCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

type BetaMap = Partial<Record<BetaLang, string>>;
export type LabelCols = { label_en: string; label_hi: string; label_ta: string; labels_beta?: BetaMap | null };
type LabelRow = LabelCols & { id: string };
/** Core columns plus the beta jsonb; a beta language without an entry is read as English (see `inLang`). */
export const labelsOf = (r: LabelCols): Labels => ({ ...r.labels_beta, en: r.label_en, hi: r.label_hi, ta: r.label_ta });
const labelled = (r: LabelRow): LabelledItem => ({ id: r.id, labels: labelsOf(r) });
const COLS = "label_en, label_hi, label_ta, labels_beta";

/** The beta-language entries of a translated text, for a `labels_beta` / `meanings_beta` column. */
export const betaOnly = (v: Partial<Record<Lang, string>>, max = 80): BetaMap =>
  Object.fromEntries(BETA_LANGS.flatMap((l) => (v[l] ? [[l, v[l]!.slice(0, max)]] : [])));

/** Languages the crew's members read. */
export async function crewLangs(crewId: string): Promise<Lang[]> {
  const rows = ok(await db().from("profiles").select("language").eq("crew_id", crewId)) as { language: Lang }[];
  return [...new Set(rows.map((r) => r.language))];
}

/**
 * Give the crew's default list items their beta-language labels (from code, no AI). Called when a member
 * picks a beta language; only untouched default rows with no beta labels yet are written, so it is safe to repeat.
 * Items the supervisor added keep whatever they have (English for a language added later).
 */
export async function ensureBetaLabels(crewId: string) {
  const fill = (table: string, seeds: SeedItem[]) => seeds.map(async (s) => ok(await db().from(table).update({ labels_beta: s.beta })
    .eq("crew_id", crewId).eq("label_en", s.labels.en).eq("label_hi", s.labels.hi).eq("labels_beta", "{}").select("id")));
  await Promise.all([...fill("site_places", DEFAULT_PLACES), ...fill("site_actions", DEFAULT_ACTIONS), ...fill("site_safety_points", DEFAULT_SAFETY_POINTS)]);
}

export async function crewLists(crewId: string): Promise<CrewLists> {
  const [p, a] = await Promise.all([
    db().from("site_places").select(`id, ${COLS}`).eq("crew_id", crewId).order("sort"),
    db().from("site_actions").select(`id, ${COLS}`).eq("crew_id", crewId).order("sort"),
  ]);
  return { places: (ok(p) as LabelRow[]).map(labelled), actions: (ok(a) as LabelRow[]).map(labelled) };
}

/** Insert the default lists. `ids` gives fixed ids (judge seed) so a re-run is a no-op. */
export async function seedLists(crewId: string, ids?: (kind: "place" | "action", i: number) => string) {
  const rows = (items: SeedItem[], kind: "place" | "action") => items.map((it, i) => ({
    ...(ids ? { id: ids(kind, i) } : {}), crew_id: crewId, sort: i,
    label_en: it.labels.en, label_hi: it.labels.hi, label_ta: it.labels.ta, labels_beta: it.beta,
  }));
  ok(await db().from("site_places").upsert(rows(DEFAULT_PLACES, "place"), { ignoreDuplicates: true }));
  ok(await db().from("site_actions").upsert(rows(DEFAULT_ACTIONS, "action"), { ignoreDuplicates: true }));
  await ensureSafetyPoints(crewId);
}

// ---------- safety points list (Safety briefing check) ----------
export type SafetyPoint = LabelledItem & { key: string | null; removed: boolean };
type SafetyRow = LabelRow & { key: string | null; removed_at: string | null };

/**
 * Give a crew the default safety points once. Lazy and idempotent: only a crew with no rows at all is seeded
 * (removed points stay as rows, so a supervisor's removals are never undone), and (crew_id, key) is unique.
 */
export async function ensureSafetyPoints(crewId: string) {
  const r = await db().from("site_safety_points").select("id", { count: "exact", head: true }).eq("crew_id", crewId);
  if (r.error) throw new Error(`db: ${r.error.message}`);
  if (r.count) return;
  ok(await db().from("site_safety_points").upsert(DEFAULT_SAFETY_POINTS.map((p, i) => ({
    crew_id: crewId, key: p.key, sort: i, label_en: p.labels.en, label_hi: p.labels.hi, label_ta: p.labels.ta, labels_beta: p.beta,
  })), { onConflict: "crew_id,key", ignoreDuplicates: true }));
}

/** The crew's safety points in list order; `withRemoved` also returns removed ones (old briefings name them). */
export async function safetyPoints(crewId: string, withRemoved = false): Promise<SafetyPoint[]> {
  await ensureSafetyPoints(crewId);
  let q = db().from("site_safety_points").select(`id, key, ${COLS}, removed_at`).eq("crew_id", crewId);
  if (!withRemoved) q = q.is("removed_at", null);
  const rows = ok(await q.order("sort").order("created_at")) as SafetyRow[];
  return rows.map((r) => ({ ...labelled(r), key: r.key, removed: r.removed_at != null }));
}

/** `used`: beta labels are sent only for languages a member reads, so a crew without beta readers sees its lists as before. */
const item = (it: LabelledItem, lang: Lang, used: Set<Lang>): ListItem => ({
  id: it.id, label: inLang(it.labels, lang),
  labels: { ...it.labels, ...Object.fromEntries(BETA_LANGS.filter((l) => !used.has(l)).map((l) => [l, undefined])) },
});

export async function crewDTO(crewId: string, lang: Lang): Promise<CrewDTO> {
  const [crew, members, lists, safety] = await Promise.all([
    db().from("crews").select("id, name, site_name, join_code").eq("id", crewId).single(),
    db().from("profiles").select("id, display_name, role, language").eq("crew_id", crewId).order("created_at"),
    crewLists(crewId),
    safetyPoints(crewId),
  ]);
  const c = ok(crew) as { id: string; name: string; site_name: string; join_code: string };
  const people = ok(members) as { id: string; display_name: string; role: Role; language: Lang }[];
  const used = new Set(people.map((m) => m.language));
  return {
    ...c,
    members: people,
    places: lists.places.map((p) => item(p, lang, used)),
    actions: lists.actions.map((a) => item(a, lang, used)),
    safety_points: safety.map((p) => ({ ...item(p, lang, used), key: p.key })),
  };
}
