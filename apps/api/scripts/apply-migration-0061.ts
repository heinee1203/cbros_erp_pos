/**
 * Apply migration 0061_supplier_soa_records.sql directly.
 * Same rationale as apply-migration-0060.ts: drizzle-kit journal is out of
 * sync with the hand-written migrations, so we execute the SQL file via
 * the standard postgres client. Safe to re-run.
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
  "../../../packages/database/migrations/0061_supplier_soa_records.sql",
);

async function main() {
  console.log(`Applying migration: ${MIGRATION_PATH}\n`);

  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error("ABORT: migration file not found");
    process.exit(1);
  }

  const ddl = fs.readFileSync(MIGRATION_PATH, "utf-8");
  await db.execute(sql.raw(ddl));
  console.log("Migration applied.\n");

  // ── Verify new tables ──
  for (const t of ["supplier_soa_records", "supplier_soa_line_items", "supplier_soa_number_sequence"]) {
    const [{ exists }] = (await db.execute(sql`
      SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = ${t}) AS exists
    `)) as any[];
    console.log(`  ${t.padEnd(32)} ${exists ? "\u2713" : "\u2717"}`);
  }

  // ── Verify new columns on supplier_invoices ──
  const cols = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'supplier_invoices'
      AND column_name IN ('billed','billed_soa_id')
    ORDER BY column_name
  `)) as any[];
  console.log("\nNew columns on supplier_invoices:");
  console.table(cols);

  // ── Verify indexes ──
  const idx = (await db.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename IN ('supplier_soa_records','supplier_soa_line_items','supplier_soa_number_sequence','supplier_invoices')
      AND (indexname LIKE 'idx_supplier_soa%' OR indexname LIKE 'idx_supplier_invoices_billed%')
    ORDER BY indexname
  `)) as any[];
  console.log("\nRelevant indexes:");
  console.table(idx);

  // ── Sanity: no existing data should be affected ──
  const [{ n: existingInvoices }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM supplier_invoices WHERE billed = false
  `)) as any[];
  const [{ total_invoices }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS total_invoices FROM supplier_invoices
  `)) as any[];
  console.log(`\nExisting supplier_invoices: ${total_invoices} total, ${existingInvoices} billed=false (all should be unbilled after migration)`);
  if (existingInvoices !== total_invoices) {
    console.error(`\u2717 UNEXPECTED: some existing invoices are billed=true without a SOA`);
    process.exit(1);
  }
  console.log("\u2713 All existing invoices correctly default to billed=false.");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
