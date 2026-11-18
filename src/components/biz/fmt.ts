import type { Lang } from "@/lib/types";

const LOC: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN" };

/** "18 Nov, 3:30 pm" in the reader's language, viewer's own time zone. */
export const when = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(LOC[lang], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "18 Nov 2026, 3:30 pm" for the printed record. */
export const whenFull = (iso: string | number, lang: Lang) =>
  new Date(iso).toLocaleString(LOC[lang], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** "YYYY-MM-DD" (an IST day key from the API) as "18 Nov". */
export const dayLabel = (day: string, lang: Lang) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(LOC[lang], { day: "numeric", month: "short", timeZone: "UTC" });
