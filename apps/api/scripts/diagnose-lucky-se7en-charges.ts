/**
 * Check all charges + the "extra" printed invoices.
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
  const CUST = "730a74fc-47ae-4b61-ad7d-237f4b0aa70a";

  // Extra invoices that appeared on the printed SOA but NOT in line items
  console.log("=== Extra printed invoices (Q3340, Q3481, Q3622, Q3651, Q3746) ===");
  const r1 = await db.execute(sql`
    SELECT reference_number, type, amount::text, billed, billed_soa_id, recorded_at
    FROM customer_transactions
    WHERE customer_id = ${CUST}
    AND reference_number IN ('Q3340','Q3481','Q3622','Q3651','Q3746')
    ORDER BY recorded_at
  `) as any[];
  for (const row of r1) {
    console.log(
      `  ${row.reference_number}  ${row.type}  ₱${row.amount}  billed=${row.billed}  soa=${row.billed_soa_id ?? "—"}`,
    );
  }

  // Also check if those invoices appear in any SOA line items
  console.log("\n=== SOA line-item membership for extras ===");
  const r1b = await db.execute(sql`
    SELECT ct.reference_number, sh.soa_number
    FROM customer_transactions ct
    LEFT JOIN soa_line_items sli ON sli.transaction_id = ct.id
    LEFT JOIN soa_records sh ON sh.id = sli.soa_id
    WHERE ct.customer_id = ${CUST}
    AND ct.reference_number IN ('Q3340','Q3481','Q3622','Q3651','Q3746')
    ORDER BY ct.recorded_at
  `) as any[];
  for (const row of r1b) {
    console.log(`  ${row.reference_number}  soa=${row.soa_number ?? "NONE"}`);
  }

  // All charges for Lucky Se7en
  console.log("\n=== ALL charges for Lucky Se7en ===");
  const r2 = await db.execute(sql`
    SELECT ct.reference_number, ct.type, ct.amount::text, ct.billed, ct.billed_soa_id,
      COALESCE((
        SELECT SUM(pa.allocated_amount::numeric)
        FROM ar_payment_allocations pa
        WHERE pa.charge_transaction_id = ct.id
      ), 0)::text AS allocated,
      ct.recorded_at::text
    FROM customer_transactions ct
    WHERE ct.customer_id = ${CUST}
      AND ct.type IN ('CHARGE', 'CREDIT_NOTE')
    ORDER BY ct.recorded_at
  `) as any[];
  let totalCharges = 0;
  let totalCredits = 0;
  let totalAllocated = 0;
  for (const row of r2) {
    const amt = parseFloat(row.amount);
    const alloc = parseFloat(row.allocated);
    const rem = amt - alloc;
    if (row.type === "CHARGE") {
      totalCharges += amt;
      totalAllocated += alloc;
    } else if (row.type === "CREDIT_NOTE") {
      totalCredits += amt;
    }
    console.log(
      `  ${row.reference_number}  ${row.type}  ₱${amt.toFixed(2)}  alloc=₱${alloc.toFixed(2)}  rem=₱${rem.toFixed(2)}  billed=${row.billed}  soa=${row.billed_soa_id ?? "—"}`,
    );
  }
  console.log(
    `\n  Sum: charges=₱${totalCharges.toFixed(2)}  credits=₱${totalCredits.toFixed(2)}  allocated=₱${totalAllocated.toFixed(2)}  unpaid=₱${(totalCharges - totalAllocated).toFixed(2)}`,
  );

  // Payment allocations total
  console.log("\n=== PAY-2026-0062 details ===");
  const r3 = await db.execute(sql`
    SELECT amount::text, notes, recorded_at::text,
      (SELECT COALESCE(SUM(pa.allocated_amount::numeric), 0)::text
       FROM ar_payment_allocations pa
       WHERE pa.payment_transaction_id = ct.id) AS total_allocated
    FROM customer_transactions ct
    WHERE ct.customer_id = ${CUST}
    AND ct.payment_number = 'PAY-2026-0062'
  `) as any[];
  for (const row of r3) {
    console.log(`  amount=₱${row.amount}  total_allocated=₱${row.total_allocated}  at=${row.recorded_at}`);
    console.log(`  notes: ${row.notes}`);
    const unused = parseFloat(row.amount) - parseFloat(row.total_allocated);
    console.log(`  unused/change: ₱${unused.toFixed(2)}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
