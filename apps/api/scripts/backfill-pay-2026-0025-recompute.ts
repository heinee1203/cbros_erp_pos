/**
 * Recompute SOA status for the two charges touched by the PAY-2026-0025
 * backfill (Q2503 in SOA-2026-0041 and Q3045 in SOA-2026-0040).
 *
 * Calls the same recomputeSOAStatusForCharges() that recordPayment uses,
 * so the status column is derived from real ar_payment_allocations — never
 * hand-set.
 *
 * Run AFTER apps/api/scripts/backfill-pay-2026-0025.sql:
 *   npx tsx apps/api/scripts/backfill-pay-2026-0025-recompute.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { recomputeSOAStatusForCharges } from "../src/modules/customers/service";

const Q2503_ID = "cbad7a70-be3b-43fe-89ed-ebc64c7ceba5";
const Q3045_ID = "1fd0f124-8a59-498a-9c3f-6e783a4003ab";

async function main() {
  const [orgRow] = (await db.execute(sql`
    SELECT org_id FROM customer_transactions WHERE id = ${Q2503_ID}
  `)) as any[];
  if (!orgRow) throw new Error(`Q2503 charge ${Q2503_ID} not found`);
  const orgId = orgRow.org_id as string;

  console.log(`Recomputing SOA status for both touched charges (orgId=${orgId})`);
  await db.transaction(async (tx) => {
    await recomputeSOAStatusForCharges(tx, orgId, [Q2503_ID, Q3045_ID]);
  });

  const after = (await db.execute(sql`
    SELECT soa_number, total_payable, paid_amount, status
    FROM soa_records
    WHERE soa_number IN ('SOA-2026-0041', 'SOA-2026-0040')
    ORDER BY soa_number
  `)) as any[];
  console.log("\nAfter recompute:");
  for (const r of after) {
    console.log(`  ${r.soa_number}: payable=${r.total_payable}, paid=${r.paid_amount}, status=${r.status}`);
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
