/**
 * Add index on customer_transactions.reference_number for invoice search.
 * Run: npx tsx apps/api/scripts/add-reference-no-index.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== Add reference_number index ===\n");
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_customer_txn_reference_number ON customer_transactions (org_id, reference_number) WHERE reference_number IS NOT NULL`);
    console.log("Created idx_customer_txn_reference_number");
  } catch (e: any) { console.log("Index may already exist:", e.message); }

  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_customer_txn_payment_number ON customer_transactions (org_id, payment_number) WHERE payment_number IS NOT NULL`);
    console.log("Created idx_customer_txn_payment_number");
  } catch (e: any) { console.log("Index may already exist:", e.message); }

  console.log("Done");
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
