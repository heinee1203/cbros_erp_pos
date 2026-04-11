/**
 * Apply migration 0062_suppliers_ap_fields.sql. Same pattern as 0060/0061.
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
  "../../../packages/database/migrations/0062_suppliers_ap_fields.sql",
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

  // Verify new columns
  const cols = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'suppliers'
      AND column_name IN (
        'contact_person','tin','payment_terms_days','credit_limit',
        'bank_name','bank_account_number','bank_account_name',
        'notes','is_active'
      )
    ORDER BY column_name
  `)) as any[];
  console.log("New columns on suppliers:");
  console.table(cols);

  const [{ total, active }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_active = true)::int AS active
    FROM suppliers
  `)) as any[];
  console.log(`\nExisting suppliers: ${total} total, ${active} active (should match)`);
  if (total !== active) {
    console.error("UNEXPECTED: some suppliers are already inactive before migration");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
