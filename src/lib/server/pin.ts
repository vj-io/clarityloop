// Worker PIN (FR-2): scrypt with a per-user salt. Stored as "salt:hash" (hex).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PIN_RE = /^\d{4}$/;
export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MS = 5 * 60_000;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, "hex");
  const got = scryptSync(pin, Buffer.from(salt, "hex"), want.length);
  return timingSafeEqual(want, got);
}
