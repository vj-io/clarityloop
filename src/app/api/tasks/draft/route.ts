import { z } from "zod";
import { LangSchema } from "@/lib/types";
import { draftFields, extractFields } from "@/lib/server/ai";
import { requireMe } from "@/lib/server/auth";
import { memberConversation } from "@/lib/server/conversations";
import { crewLists } from "@/lib/server/crew";
import { db, logHealth } from "@/lib/server/db";
import { body, fail, forbidden, json, route } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * "Make this a task": read a chat message into task-form fields with the same extractor the meaning check uses.
 * Nothing is saved; the supervisor checks the form and presses "Send task". { draft: null } when nothing was found
 * or the AI is unavailable: the form then opens empty.
 */
export const POST = route(async (req) => {
  const me = await requireMe(req, "supervisor");
  const b = await body(req, z.object({ conversation_id: z.uuid(), text: z.string().trim().min(1).max(1000), language: LangSchema.optional() }));
  const conv = await memberConversation(b.conversation_id, me.id);
  if (conv.supervisor_id !== me.id) return forbidden();
  const { data: count, error } = await db().rpc("rate_add", { p_profile: me.id, p_bucket: "draft", p_window_seconds: 60, p_n: 1 });
  if (error) throw new Error(`db: ${error.message}`);
  if ((count as number) > 6) return fail(429, "rate_limited");
  const lists = await crewLists(conv.crew_id);
  const t0 = Date.now();
  const ex = await extractFields(b.text, b.language ?? me.language, lists.actions, lists.places);
  await logHealth("extract", ex !== null, ex ? null : "ai_error", Date.now() - t0);
  return json({ draft: draftFields(ex) });
});
