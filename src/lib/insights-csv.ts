// CSV for spreadsheet programs: pure, no I/O (unit-tested in src/lib/insights-csv.test.ts).

/** A cell that starts with = + - @ (or a tab / carriage return) would run as a formula: a leading ' makes it plain text. */
const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`;
};

/** UTF-8 with a BOM, so Excel reads Hindi and Tamil; every cell quoted; CRLF rows. */
export const toCsv = (rows: (string | number | null)[][]) => "﻿" + rows.map((r) => r.map(cell).join(",") + "\r\n").join("");

/** "2026-11-18 15:30" in IST (the same fixed zone the dashboard's day buckets use); "" for null. */
export const istStamp = (iso: string | null) =>
  iso ? new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "";
