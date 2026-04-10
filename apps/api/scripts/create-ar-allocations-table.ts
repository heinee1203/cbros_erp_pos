/**
 * Create ar_payment_allocations table.
 * Run: npx tsx apps/api/scripts/create-ar-allocations-table.ts
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
  console.log("=== Create ar_payment_allocations table ===\n");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ar_payment_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      payment_transaction_id UUID NOT NULL REFERENCES customer_transactions(id) ON DELETE CASCADE,
      charge_transaction_id UUID NOT NULL REFERENCES customer_transactions(id),
      allocated_amount NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("Table created");

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_alloc_unique ON ar_payment_allocations(payment_transaction_id, charge_transaction_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ar_alloc_payment ON ar_payment_allocations(payment_transaction_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ar_alloc_charge ON ar_payment_allocations(charge_transaction_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ar_alloc_org ON ar_payment_allocations(org_id)`);
  console.log("Indexes created");

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
