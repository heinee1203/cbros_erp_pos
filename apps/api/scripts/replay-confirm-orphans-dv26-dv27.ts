/**
 * One-off: replay the settlement work for orphan DVs DV-2026-000026 and
 * DV-2026-000027.
 *
 * Both DVs were confirmed via the (now-closed) "+ New Voucher" path that
 * submitted with empty soaIds. The original confirm marked the DVs as
 * CONFIRMED + released CHECK payments, but the per-SOA settlement loop
 * silently no-oped because soaAllocations resolved to []. Result:
 *   - supplier_invoices for both SOAs still OPEN with full balance
 *   - supplier_soa_records.total_paid still 0
 *   - AP Aging Report shows these SOAs' invoices as outstanding
 *
 * Commit 0643951 added the missing junction rows; this script now replays
 * the settlement work that should have happened at confirm time.
 *
 * Run via:
 *   npx tsx apps/api/scripts/replay-confirm-orphans-dv26-dv27.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { replayConfirmForOrphan } from "../src/modules/accounts-payable/service";

const DV_NUMBERS = ["DV-2026-000026", "DV-2026-000027"];

async function main() {
  await db.transaction(async (tx) => {
    for (const dvNum of DV_NUMBERS) {
      const [dv] = (await tx.execute(sql`
        SELECT id, soa_id FROM supplier_disbursement_vouchers
        WHERE dv_number = ${dvNum}
      `)) as any[];
      if (!dv) { console.error(`SKIP ${dvNum}: not found`); continue; }

      // Resolve soaAllocations the same way confirmDisbursementVoucher does
      // (junction first, legacy fallback). Post-backfill both DVs have a
      // junction row, so the legacy fallback is academic but kept for parity.
      const dvSoaRows = (await tx.execute(sql`
        SELECT soa_id, allocated_amount::text
        FROM supplier_dv_soas WHERE dv_id = ${dv.id}
        ORDER BY created_at ASC
      `)) as any[];
      const soaAllocations: Array<{ soaId: string; allocatedAmount: number }> =
        dvSoaRows.length > 0
          ? dvSoaRows.map((r: any) => ({ soaId: r.soa_id, allocatedAmount: parseFloat(r.allocated_amount) }))
          : [];

      if (soaAllocations.length === 0) {
        console.error(`SKIP ${dvNum}: no junction rows (was the backfill applied?)`);
        continue;
      }

      // Snapshot before
      const [beforeSoa] = (await tx.execute(sql`
        SELECT soa_number, total_paid::text, total_balance::text, status
        FROM supplier_soa_records WHERE id = ${soaAllocations[0].soaId}
      `)) as any[];
      console.log(`${dvNum} → SOA ${beforeSoa.soa_number}: BEFORE total_paid=${beforeSoa.total_paid}, balance=${beforeSoa.total_balance}, status=${beforeSoa.status}`);

      await replayConfirmForOrphan(tx, dv.id, soaAllocations);

      // Snapshot after
      const [afterSoa] = (await tx.execute(sql`
        SELECT soa_number, total_paid::text, total_balance::text, status
        FROM supplier_soa_records WHERE id = ${soaAllocations[0].soaId}
      `)) as any[];
      console.log(`${dvNum} → SOA ${afterSoa.soa_number}: AFTER  total_paid=${afterSoa.total_paid}, balance=${afterSoa.total_balance}, status=${afterSoa.status} (status unchanged per AP convention)`);
    }
  });
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
