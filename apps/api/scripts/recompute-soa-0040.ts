/**
 * One-off: recompute SOA-2026-0040 status after the recomputeSOAStatus
 * coverage-logic change.
 *
 * Before this fix, the SOA was stuck at PARTIAL because PAY-2026-0106
 * (₱111,230 = SOA's net) ran out of cash exactly on the last charge by
 * the CM amount, leaving unpaidCharges=1. The new logic treats CM line
 * items as automatic coverage; after this script runs, the SOA flips
 * to PAID.
 *
 * Run:
 *   npx tsx apps/api/scripts/recompute-soa-0040.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { recomputeSOAStatus } from "../src/modules/customers/service";

async function main() {
  const [soa] = (await db.execute(sql`
    SELECT id, org_id, status FROM soa_records WHERE soa_number = 'SOA-2026-0040'
  `)) as any[];
  if (!soa) throw new Error("SOA-2026-0040 not found");

  console.log(`SOA-2026-0040 before: ${soa.status}`);
  const result = await db.transaction(async (tx) => {
    return await recomputeSOAStatus(tx, soa.org_id, soa.id);
  });
  console.log(`SOA-2026-0040 after:  ${result?.newStatus ?? "(no change)"}`);
  console.log(`  realAllocated: ${result?.realAllocated}, totalPayable: ${result?.totalPayable}`);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
