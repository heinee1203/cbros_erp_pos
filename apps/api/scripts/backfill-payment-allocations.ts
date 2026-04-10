/**
 * Backfill ar_payment_allocations for all existing PAYMENT transactions using FIFO.
 * Run: npx tsx apps/api/scripts/backfill-payment-allocations.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customerTransactions, arPaymentAllocations } from "@apex/database/schema";
import { eq, and, asc, sql } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  console.log("=== Backfill Payment Allocations (FIFO) ===\n");

  // Get all PAYMENT and CREDIT_NOTE transactions, ordered by date
  const payments = await db
    .select({ id: customerTransactions.id, customerId: customerTransactions.customerId, amount: customerTransactions.amount, type: customerTransactions.type, recordedAt: customerTransactions.recordedAt })
    .from(customerTransactions)
    .where(and(
      eq(customerTransactions.orgId, ORG_ID),
      sql`${customerTransactions.type} IN ('PAYMENT', 'CREDIT_NOTE')`,
    ))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  console.log(`Found ${payments.length} payment/credit transactions to process`);

  // Clear existing allocations first (idempotent re-run)
  await db.execute(sql`DELETE FROM ar_payment_allocations WHERE org_id = ${ORG_ID}`);
  console.log("Cleared existing allocations\n");

  let totalAllocations = 0;
  let processed = 0;

  for (const payment of payments) {
    const paymentAmount = parseFloat(payment.amount);
    if (paymentAmount <= 0) continue;

    // Get all CHARGE transactions for this customer, oldest first
    const charges = await db
      .select({ id: customerTransactions.id, amount: customerTransactions.amount })
      .from(customerTransactions)
      .where(and(
        eq(customerTransactions.customerId, payment.customerId),
        eq(customerTransactions.orgId, ORG_ID),
        eq(customerTransactions.type, "CHARGE" as any),
      ))
      .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

    let remaining = paymentAmount;
    for (const charge of charges) {
      if (remaining <= 0.005) break;
      const chargeAmt = parseFloat(charge.amount);

      // Sum existing allocations against this charge
      const [allocated] = await db.execute(
        sql`SELECT COALESCE(SUM(allocated_amount::numeric), 0) AS total FROM ar_payment_allocations WHERE charge_transaction_id = ${charge.id}`,
      ) as any[];
      const alreadyAllocated = parseFloat(allocated.total);
      const unpaid = chargeAmt - alreadyAllocated;
      if (unpaid <= 0.005) continue;

      const alloc = Math.min(remaining, unpaid);
      await db.insert(arPaymentAllocations).values({
        orgId: ORG_ID,
        paymentTransactionId: payment.id,
        chargeTransactionId: charge.id,
        allocatedAmount: alloc.toFixed(2),
      });
      remaining -= alloc;
      totalAllocations++;
    }

    processed++;
    if (processed % 50 === 0) console.log(`  Processed ${processed}/${payments.length} payments (${totalAllocations} allocations)`);
  }

  console.log(`\nDone: ${processed} payments → ${totalAllocations} allocation records`);

  // Verify
  const [count] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM ar_payment_allocations WHERE org_id = ${ORG_ID}`) as any[];
  console.log(`Verification: ${count.cnt} allocation records in table`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
