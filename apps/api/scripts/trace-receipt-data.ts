/**
 * Trace receipt data for PAY-2026-0042.
 * Run: npx tsx apps/api/scripts/trace-receipt-data.ts
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
  console.log("=== Trace PAY-2026-0042 Receipt Data ===\n");

  // 1. Find the payment
  const [pay] = await db.execute(sql`
    SELECT id, payment_number, amount, customer_id, notes, payment_lines
    FROM customer_transactions WHERE payment_number = 'PAY-2026-0042'
  `) as any[];

  if (!pay) { console.log("PAY-2026-0042 NOT FOUND"); process.exit(1); }
  console.log("Payment:", pay.payment_number, "Amount:", pay.amount, "Customer:", pay.customer_id);
  console.log("Notes:", pay.notes);
  console.log("PaymentLines:", JSON.stringify(pay.payment_lines));

  // 2. Check ar_payment_allocations
  const allocs = await db.execute(sql`
    SELECT pa.allocated_amount, ct.reference_number, ct.amount
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
    WHERE pa.payment_transaction_id = ${pay.id}
    ORDER BY ct.recorded_at
  `) as any[];

  console.log(`\nAllocations: ${allocs.length} rows`);
  for (const a of allocs) {
    console.log(`  ${a.reference_number}  allocated: ${a.allocated_amount}  charge: ${a.amount}`);
  }

  // 3. Check SOA linked to this payment (from notes)
  const soaMatch = (pay.notes || "").match(/\[SOA:\s*([^\]]+)\]/);
  console.log("\nSOA from notes:", soaMatch ? soaMatch[1] : "NONE");

  // 4. If SOA exists, get its invoices
  if (soaMatch) {
    const soaNum = soaMatch[1].trim();
    const [soa] = await db.execute(sql`SELECT id FROM soa_records WHERE soa_number = ${soaNum}`) as any[];
    if (soa) {
      const invoices = await db.execute(sql`
        SELECT ct.reference_number, ct.type, ct.amount
        FROM soa_line_items sli
        JOIN customer_transactions ct ON ct.id = sli.transaction_id
        WHERE sli.soa_id = ${soa.id}
        ORDER BY ct.recorded_at
      `) as any[];
      console.log(`\nSOA ${soaNum} invoices: ${invoices.length}`);
      for (const inv of invoices) {
        console.log(`  ${inv.reference_number}  ${inv.type}  ${inv.amount}`);
      }
    } else {
      console.log("SOA record not found in DB");
    }
  }

  // 5. Summary
  console.log("\n=== DIAGNOSIS ===");
  if (allocs.length === 0) {
    console.log("PROBLEM: No ar_payment_allocations rows for this payment.");
    console.log("The receipt builder reads from frontend state (invoiceAllocs/soaInvoices),");
    console.log("NOT from the database. The allocations were likely not created at payment time.");
  } else {
    console.log(`OK: ${allocs.length} allocation rows exist. The receipt should show them IF the frontend passes them.`);
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
