import { z } from "zod";
import { LangSchema } from "@/lib/types";
import { requireUser, toMe, type ProfileRow } from "@/lib/server/auth";
import { crewDTO, newJoinCode, seedLists } from "@/lib/server/crew";
import { db, nexconnId, ok } from "@/lib/server/db";
import { body, fail, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

const Body = z.object({
  display_name: z.string().trim().min(1).max(40),
  language: LangSchema,
  crew_name: z.string().trim().min(1).max(60),
  site_name: z.string().trim().min(1).max(80),
});

/** First call by a signed-in supervisor: creates their profile, the crew and the default lists. */
export const POST = route(async (req) => {
  const { userId, profile } = await requireUser(req);
  if (profile?.crew_id) return fail(409, "conflict", "already in a crew");
  if (profile && profile.role !== "supervisor") return fail(403, "forbidden");
  const b = await body(req, Body);

  let crewId = "";
  for (let i = 0; !crewId; i++) {
    const r = await db().from("crews").insert({ name: b.crew_name, site_name: b.site_name, join_code: newJoinCode(), supervisor_id: userId }).select("id").single();
    if (!r.error) crewId = r.data.id;
    else if (r.error.code !== "23505" || i >= 5) throw new Error(`db: ${r.error.message}`); // 23505: join code taken, try another
  }
  await seedLists(crewId);
  const me = ok(await db().from("profiles").upsert({
    id: userId, display_name: b.display_name, role: "supervisor", language: b.language, crew_id: crewId, nexconn_user_id: nexconnId(userId),
  }).select("*").single()) as ProfileRow;
  return json({ me: toMe(me), crew: await crewDTO(crewId, me.language) });
});
