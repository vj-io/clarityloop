import { z } from "zod";
import { CARD, type I18n, type Lang } from "@/lib/types";
import { compareBriefing, nextState, unionSaid } from "@/lib/briefing";
import { AI_MODEL, extractSafetyPoints, translateText } from "@/lib/server/ai";
import { requireMe } from "@/lib/server/auth";
import { briefingDTO, loadBriefing, type AttemptDb, type ReplyRowDb } from "@/lib/server/briefings";
import { postCard } from "@/lib/server/cards";
import { crewLists, safetyPoints } from "@/lib/server/crew";
import { audit, db, logHealth, ok, overLimit } from "@/lib/server/db";
import { body, fail, forbidden, idParam, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * The worker says the briefing back once, in their own words. The AI maps the words onto the crew's whole
 * safety list (it is not told which points were picked); plain code then checks every picked point was said.
 * Points said in an earlier reply stay said. If the AI cannot check, the words are kept and nothing changes.
 */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe(req, "worker");
  const b = await loadBriefing(await idParam(ctx), me);
  const reply = ok(await db().from("briefing_replies").select("*").eq("briefing_id", b.id).eq("worker_id", me.id).maybeSingle()) as ReplyRowDb | null;
  if (!reply) return forbidden();
  if (reply.state === "understood") return fail(409, "conflict", "briefing already understood");
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(1000) }));
  if (await overLimit(me.id, "briefing_reply", 10)) return fail(429, "rate_limited");

  const [all, lists, sup] = await Promise.all([
    safetyPoints(b.crew_id, true),
    crewLists(b.crew_id),
    db().from("profiles").select("language").eq("id", b.supervisor_id).single(),
  ]);
  // the crew's whole current list, plus any picked point removed since the briefing was sent
  const listed = all.filter((p) => !p.removed || b.point_ids.includes(p.id));
  const t0 = Date.now();
  const ex = await extractSafetyPoints(text, me.language, listed);
  const ms = Date.now() - t0;
  await logHealth("extract_safety", ex != null, ex ? null : "unreadable", ms);

  const said = ex ? unionSaid(reply.said_point_ids ?? [], ex.said) : reply.said_point_ids ?? [];
  const result = ex ? compareBriefing(b.point_ids, said) : null;
  const state = nextState(reply.state, result);

  // "What we understood" for the two readers (worker and supervisor); English if a translation fails.
  const gloss: I18n = {};
  if (ex) {
    gloss.en = ex.gloss_en;
    const want = [...new Set([me.language, (ok(sup) as { language: Lang }).language])].filter((l) => l !== "en");
    await Promise.all(want.map(async (l) => {
      try { gloss[l] = (await translateText(ex.gloss_en, l, lists))?.text ?? ex.gloss_en; } catch { /* English only */ }
    }));
  }
  const now = new Date().toISOString();
  const attempt: AttemptDb = { at: now, text, language: me.language, said: ex?.said ?? [], unreadable: !ex, gloss, model_id: ex ? AI_MODEL : null, ms };
  ok(await db().from("briefing_replies").update({
    state, said_point_ids: said, original_text: text, language: me.language, updated_at: now,
    attempts: [...(reply.attempts ?? []), attempt],
    ...(ex ? { gloss, model_id: AI_MODEL, ms } : {}),
    ...(state === "understood" ? { understood_at: now } : {}),
  }).eq("id", reply.id).select("id"));
  await audit(null, me.id, "briefing_reply", {
    briefing_id: b.id, from: reply.state, to: state, unreadable: !ex, said: ex?.said ?? [], missing: result?.missing ?? null,
  });
  // the worker's card comes back at the bottom of the pair chat with the result; the roll call refetches
  await Promise.all([
    postCard(reply.conversation_id, CARD.BRIEF + b.id),
    postCard(b.conversation_id, `${CARD.STATE}${b.id}:brief`),
  ]);
  return json({ briefing: await briefingDTO(b, me) });
});
