// Applies supabase/schema.sql. Run: npm run db:apply   (reads .env.local)
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) throw new Error("POSTGRES_URL_NON_POOLING is not set (run `vercel env pull .env.local`)");
const sql = postgres(url, { ssl: "require", max: 1 });
try {
  await sql.unsafe(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  const t = await sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
  console.log(`schema applied; public tables: ${t[0].n}`);
} finally {
  await sql.end();
}
