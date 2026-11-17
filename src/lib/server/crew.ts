// Crews and their place/action lists (FR-3).
import { randomInt } from "node:crypto";
import type { CrewDTO, Lang, ListItem, Role } from "../types.ts";
import type { CrewLists, LabelledItem } from "./ai.ts";
import { db, ok } from "./db.ts";
import { DEFAULT_ACTIONS, DEFAULT_PLACES, type SeedItem } from "./seed.ts";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const newJoinCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

type LabelRow = { id: string; label_en: string; label_hi: string; label_ta: string };
const labelled = (r: LabelRow): LabelledItem => ({ id: r.id, labels: { en: r.label_en, hi: r.label_hi, ta: r.label_ta } });

export async function crewLists(crewId: string): Promise<CrewLists> {
  const [p, a] = await Promise.all([
    db().from("site_places").select("id, label_en, label_hi, label_ta").eq("crew_id", crewId).order("sort"),
    db().from("site_actions").select("id, label_en, label_hi, label_ta").eq("crew_id", crewId).order("sort"),
  ]);
  return { places: (ok(p) as LabelRow[]).map(labelled), actions: (ok(a) as LabelRow[]).map(labelled) };
}

/** Insert the default lists. `ids` gives fixed ids (judge seed) so a re-run is a no-op. */
export async function seedLists(crewId: string, ids?: (kind: "place" | "action", i: number) => string) {
  const rows = (items: SeedItem[], kind: "place" | "action") => items.map((it, i) => ({
    ...(ids ? { id: ids(kind, i) } : {}), crew_id: crewId, sort: i,
    label_en: it.labels.en, label_hi: it.labels.hi, label_ta: it.labels.ta,
  }));
  ok(await db().from("site_places").upsert(rows(DEFAULT_PLACES, "place"), { ignoreDuplicates: true }));
  ok(await db().from("site_actions").upsert(rows(DEFAULT_ACTIONS, "action"), { ignoreDuplicates: true }));
}

const item = (it: LabelledItem, lang: Lang): ListItem => ({ id: it.id, label: it.labels[lang], labels: it.labels });

export async function crewDTO(crewId: string, lang: Lang): Promise<CrewDTO> {
  const [crew, members, lists] = await Promise.all([
    db().from("crews").select("id, name, site_name, join_code").eq("id", crewId).single(),
    db().from("profiles").select("id, display_name, role, language").eq("crew_id", crewId).order("created_at"),
    crewLists(crewId),
  ]);
  const c = ok(crew) as { id: string; name: string; site_name: string; join_code: string };
  return {
    ...c,
    members: ok(members) as { id: string; display_name: string; role: Role; language: Lang }[],
    places: lists.places.map((p) => item(p, lang)),
    actions: lists.actions.map((a) => item(a, lang)),
  };
}
