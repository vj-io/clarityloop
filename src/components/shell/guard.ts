"use client";
// Signed-in guard: signed out -> "/", no profile -> /onboarding, wrong role -> /inbox.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/client/session";
import { makeT, type T } from "@/lib/i18n";
import type { Me, Role } from "@/lib/types";

export const ME_CHANGED = "cl:me-changed";

/** Returns me = null while loading or redirecting; t speaks the user's language (English until known). */
export function useRequireMe(opts?: { role?: Role }): { me: Me | null; t: T } {
  const { me, needsOnboarding } = useMe();
  const router = useRouter();
  const [override, setOverride] = useState<Me | null>(null);
  const cur = override ?? (me ?? null);
  const role = opts?.role;

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setOverride((e as CustomEvent<Me>).detail); };
    window.addEventListener(ME_CHANGED, on);
    return () => window.removeEventListener(ME_CHANGED, on);
  }, []);

  useEffect(() => {
    if (me === undefined) return;
    if (needsOnboarding) router.replace("/onboarding");
    else if (me === null) router.replace("/");
    else if (role && me.role !== role) router.replace("/inbox");
  }, [me, needsOnboarding, role, router]);

  useEffect(() => { if (cur) document.documentElement.lang = cur.language; }, [cur]);
  const t = useMemo(() => makeT(cur?.language ?? "en"), [cur?.language]);
  const ok = cur && (!role || cur.role === role) ? cur : null;
  return { me: ok, t };
}
