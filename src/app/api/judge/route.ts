import { z } from "zod";
import { grantFor } from "@/lib/server/auth";
import { body, fail, json, route } from "@/lib/server/http";
import { ROOMS, ensureRoom, judgeLimited, resetRoom, touchRoom } from "@/lib/server/sandbox";

export const runtime = "nodejs";

const STALE_MS = 20 * 60_000;

/**
 * FR-19: sign in as a seeded sandbox account. `room` picks one of the demo rooms (see POST /api/judge/room);
 * without it the original shared room 0 is used, which cleans itself after 20 idle minutes.
 * `role: "worker"` alone means Murugan (Hindi); `worker: "lakshmi"` picks the Tamil worker.
 */
export const POST = route(async (req) => {
  if (judgeLimited(req)) return fail(429, "rate_limited");
  const { role, worker, room: r = 0 } = await body(req, z.object({
    role: z.enum(["supervisor", "worker"]),
    worker: z.enum(["murugan", "lakshmi"]).optional(), room: z.number().int().min(0).max(ROOMS - 1).optional(),
  }));
  let room = await ensureRoom(r);
  const idle = Date.now() - Math.max(...[room.withMurugan, room.withLakshmi, room.crew].map((c) => Date.parse(c.last_activity_at)));
  if (r === 0 && idle > STALE_MS) room = await resetRoom(r);
  await touchRoom(room);
  const who = role === "supervisor" ? room.ravi : worker === "lakshmi" ? room.lakshmi : room.murugan;
  const conversation_id = role === "worker" && worker === "lakshmi" ? room.withLakshmi.id : room.withMurugan.id;
  return json({ ...(await grantFor(who.id)), conversation_id, crew_conversation_id: room.crew.id, room: r });
});
