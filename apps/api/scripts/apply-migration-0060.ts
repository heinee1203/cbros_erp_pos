/**
 * Apply migration 0060_daily_sales_summary.sql directly.
 *
 * The repo's migrations are hand-written SQL files, and the drizzle-kit
 * _journal.json is out of sync with reality (only 2 entries for 60 files),
 * so we bypass drizzle-kit and execute the SQL file with the standard
 * postgres client that the rest of the API uses.
 *
 * Safe to re-run: all CREATE statements use IF NOT EXISTS.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const MIGRATION_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/database/migrations/0060_daily_sales_summary.sql",
);

async function main() {
  console.log(`Applying migration: ${MIGRATION_PATH}\n`);

  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error(`ABORT: migration file not found`);
    process.exit(1);
  }

  const ddl = fs.readFileSync(MIGRATION_PATH, "utf-8");
  console.log("SQL to execute:");
  console.log("─".repeat(60));
  console.log(ddl);
  console.log("─".repeat(60));

  // Execute the raw SQL (contains multiple statements)
  await db.execute(sql.raw(ddl));
  console.log("\nMigration applied successfully.");

  // Verify the table exists with the expected shape
  const cols = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'daily_sales_summary'
    ORDER BY ordinal_position
  `)) as any[];
  console.log(`\nTable daily_sales_summary has ${cols.length} columns:`);
  console.table(cols);

  const indexes = (await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'daily_sales_summary'
  `)) as any[];
  console.log(`\nIndexes:`);
  console.table(indexes);

  // Row count sanity (should be 0 after first run)
  const [{ n }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM daily_sales_summary
  `)) as any[];
  console.log(`\nCurrent row count: ${n}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
