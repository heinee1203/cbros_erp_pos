/**
 * Data repair: fix every drifted SOA status by reading real
 * ar_payment_allocations on soa_line_items. Mirrors the logic in
 * recomputeSOAStatus() in apps/api/src/modules/customers/service.ts.
 *
 * Run:
 *   Dry run (show changes, write nothing):
 *     npx tsx apps/api/scripts/repair-soa-statuses.ts
 *   Apply:
 *     npx tsx apps/api/scripts/repair-soa-statuses.ts --apply
 *
 * Safe to re-run — idempotent.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

interface SoaRow {
  id: string;
  soa_number: string;
  customer_name: string;
  prev_status: string;
  prev_paid: string;
  total_payable: string;
  real_allocated: string;
  unpaid_charges: number;
  expected_status: string;
  expected_paid: string;
}

async function main() {
  console.log(`=== SOA Status Repair (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // Same formula as recomputeSOAStatus() — single source of truth.
  const rows = (await db.execute(sql`
    WITH soa_real AS (
      SELECT
        sr.id,
        sr.org_id,
        sr.soa_number,
        sr.customer_id,
        sr.status AS prev_status,
        COALESCE(sr.paid_amount, 0)::numeric AS prev_paid,
        sr.total_payable::numeric AS total_payable,
        COALESCE((
          SELECT SUM(pa.allocated_amount)::numeric
          FROM soa_line_items sli
          JOIN ar_payment_allocations pa ON pa.charge_transaction_id = sli.transaction_id
          WHERE sli.soa_id = sr.id
        ), 0) AS real_allocated,
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
        ) AS unpaid_charges
      FROM soa_records sr
      WHERE sr.status != 'VOID'
    )
    SELECT
      sr.id,
      sr.soa_number,
      c.name AS customer_name,
      sr.prev_status,
      sr.prev_paid::text AS prev_paid,
      sr.total_payable::text,
      sr.real_allocated::text,
      sr.unpaid_charges,
      CASE
        WHEN sr.real_allocated >= sr.total_payable - 0.005 AND sr.unpaid_charges = 0 THEN 'PAID'
        WHEN sr.real_allocated > 0.005 THEN 'PARTIAL'
        WHEN sr.prev_status IN ('PAID','PARTIAL') THEN 'GENERATED'
        ELSE sr.prev_status
      END AS expected_status,
      LEAST(sr.real_allocated, sr.total_payable)::text AS expected_paid
    FROM soa_real sr
    JOIN customers c ON c.id = sr.customer_id
    ORDER BY sr.soa_number
  `)) as unknown as SoaRow[];

  const drifted = rows.filter(
    (r) =>
      r.prev_status !== r.expected_status ||
      Math.abs(parseFloat(r.prev_paid) - parseFloat(r.expected_paid)) > 0.005,
  );

  console.log(`Scanned ${rows.length} non-void SOAs, ${drifted.length} drifted\n`);

  if (drifted.length === 0) {
    console.log("Nothing to repair.");
    process.exit(0);
  }

  // Group changes by class
  const byClass: Record<string, SoaRow[]> = {};
  for (const r of drifted) {
    const key = `${r.prev_status} \u2192 ${r.expected_status}`;
    (byClass[key] ??= []).push(r);
  }

  for (const [transition, items] of Object.entries(byClass)) {
    console.log(`--- ${transition} (${items.length}) ---`);
    for (const r of items) {
      const payable = parseFloat(r.total_payable).toFixed(2);
      const prev = parseFloat(r.prev_paid).toFixed(2);
      const next = parseFloat(r.expected_paid).toFixed(2);
      const real = parseFloat(r.real_allocated).toFixed(2);
      console.log(
        `  ${r.soa_number.padEnd(16)} ${r.customer_name.slice(0, 28).padEnd(30)} ` +
          `payable=${payable.padStart(10)} real=${real.padStart(10)} ` +
          `paid: ${prev} \u2192 ${next} (unpaid charges=${r.unpaid_charges})`,
      );
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to write changes.");
    process.exit(0);
  }

  // Apply in one transaction so the whole repair is atomic.
  let applied = 0;
  await db.transaction(async (tx) => {
    for (const r of drifted) {
      await tx.execute(sql`
        UPDATE soa_records
        SET status = ${r.expected_status}, paid_amount = ${r.expected_paid}
        WHERE id = ${r.id}
      `);
      applied++;
    }
  });

  console.log(`\n${applied} SOA${applied === 1 ? "" : "s"} repaired.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
