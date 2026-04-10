/**
 * Diagnostic sweep: find SOAs whose `status` / `paid_amount` disagrees
 * with the actual sum of ar_payment_allocations on the SOA's line items.
 *
 * Blast radius check for the multi-payment status-update bug at
 * apps/api/src/modules/customers/service.ts:478-492 where allocAmount
 * was naively added to every soaId in a multi-SOA payment.
 *
 * Run: npx tsx apps/api/scripts/diagnose-soa-status-drift.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

type Row = {
  id: string;
  soa_number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  total_payable: string;
  stored_paid: string;
  real_allocated: string;
  charge_count: number;
  unpaid_charge_count: number;
  expected_status: string;
  drift: string;
};

async function main() {
  console.log("=== SOA Status Drift Diagnostic ===\n");
  console.log("Comparing stored soa_records.status + paid_amount against");
  console.log("SUM(ar_payment_allocations.allocated_amount) on the SOA's line items.\n");

  const rows = (await db.execute(sql`
    WITH soa_real AS (
      SELECT
        sr.id,
        sr.soa_number,
        sr.customer_id,
        sr.status,
        sr.total_payable::numeric      AS total_payable,
        COALESCE(sr.paid_amount, 0)::numeric AS stored_paid,
        COALESCE((
          SELECT SUM(pa.allocated_amount)::numeric
          FROM soa_line_items sli
          JOIN ar_payment_allocations pa
            ON pa.charge_transaction_id = sli.transaction_id
          WHERE sli.soa_id = sr.id
        ), 0) AS real_allocated,
        (
          SELECT COUNT(*)::int FROM soa_line_items sli
          JOIN customer_transactions ct ON ct.id = sli.transaction_id
          WHERE sli.soa_id = sr.id AND ct.type = 'CHARGE'
        ) AS charge_count,
        (
          SELECT COUNT(*)::int FROM soa_line_items sli
          JOIN customer_transactions ct ON ct.id = sli.transaction_id
          LEFT JOIN (
            SELECT charge_transaction_id, SUM(allocated_amount)::numeric AS allocated
            FROM ar_payment_allocations
            GROUP BY charge_transaction_id
          ) pa ON pa.charge_transaction_id = ct.id
          WHERE sli.soa_id = sr.id
            AND ct.type = 'CHARGE'
            AND ct.amount::numeric > COALESCE(pa.allocated, 0)
        ) AS unpaid_charge_count
      FROM soa_records sr
      WHERE sr.status != 'VOID'
    )
    SELECT
      sr.id,
      sr.soa_number,
      sr.customer_id,
      c.name AS customer_name,
      sr.status,
      sr.total_payable::text,
      sr.stored_paid::text,
      sr.real_allocated::text,
      sr.charge_count,
      sr.unpaid_charge_count,
      CASE
        WHEN sr.real_allocated >= sr.total_payable AND sr.unpaid_charge_count = 0 THEN 'PAID'
        WHEN sr.real_allocated > 0 THEN 'PARTIAL'
        ELSE 'GENERATED'
      END AS expected_status,
      CASE
        WHEN sr.status = 'PAID' AND (sr.real_allocated < sr.total_payable OR sr.unpaid_charge_count > 0) THEN 'FALSE_PAID'
        WHEN sr.status = 'PARTIAL' AND sr.real_allocated >= sr.total_payable AND sr.unpaid_charge_count = 0 THEN 'SHOULD_BE_PAID'
        WHEN sr.status IN ('GENERATED','SENT') AND sr.real_allocated > 0 THEN 'SHOULD_BE_PARTIAL_OR_PAID'
        WHEN sr.stored_paid <> sr.real_allocated THEN 'PAID_AMOUNT_MISMATCH'
        ELSE 'OK'
      END AS drift
    FROM soa_real sr
    JOIN customers c ON c.id = sr.customer_id
    ORDER BY
      CASE
        WHEN sr.status = 'PAID' AND (sr.real_allocated < sr.total_payable OR sr.unpaid_charge_count > 0) THEN 0
        WHEN sr.status = 'PARTIAL' AND sr.real_allocated >= sr.total_payable AND sr.unpaid_charge_count = 0 THEN 1
        WHEN sr.status IN ('GENERATED','SENT') AND sr.real_allocated > 0 THEN 2
        WHEN sr.stored_paid <> sr.real_allocated THEN 3
        ELSE 4
      END,
      sr.soa_number
  `)) as unknown as Row[];

  // Summary by drift class
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.drift] = (counts[r.drift] ?? 0) + 1;

  console.log("=== SUMMARY ===");
  console.log(`Total non-void SOAs scanned: ${rows.length}`);
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log("");

  const problems = rows.filter((r) => r.drift !== "OK");
  if (problems.length === 0) {
    console.log("No drift. Database is consistent.");
    process.exit(0);
  }

  console.log(`=== ${problems.length} DRIFTED SOAs ===\n`);
  console.log(
    "SOA#".padEnd(16) +
      "Customer".padEnd(32) +
      "Status".padEnd(10) +
      "Expected".padEnd(12) +
      "Payable".padStart(12) +
      "StoredPaid".padStart(12) +
      "RealAlloc".padStart(12) +
      "  Lines(Unpaid)  " +
      "Drift",
  );
  console.log("-".repeat(140));

  for (const r of problems) {
    const name = (r.customer_name || "").slice(0, 30);
    const payable = parseFloat(r.total_payable).toFixed(2);
    const stored = parseFloat(r.stored_paid).toFixed(2);
    const real = parseFloat(r.real_allocated).toFixed(2);
    console.log(
      r.soa_number.padEnd(16) +
        name.padEnd(32) +
        (r.status || "").padEnd(10) +
        r.expected_status.padEnd(12) +
        payable.padStart(12) +
        stored.padStart(12) +
        real.padStart(12) +
        `  ${r.charge_count}(${r.unpaid_charge_count})`.padEnd(17) +
        r.drift,
    );
  }

  console.log("");
  console.log("=== DRIFT CLASSES ===");
  console.log("  FALSE_PAID                 status=PAID but allocations don't cover payable OR has unpaid charges");
  console.log("  SHOULD_BE_PAID             status=PARTIAL but fully allocated");
  console.log("  SHOULD_BE_PARTIAL_OR_PAID  status=GENERATED/SENT but has allocations");
  console.log("  PAID_AMOUNT_MISMATCH       status correct but stored paid_amount != real allocations");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
