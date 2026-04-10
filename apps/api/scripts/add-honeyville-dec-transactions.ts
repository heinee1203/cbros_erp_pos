/**
 * Add 3 missing December 2025 CHARGE transactions for Honeyville Construction.
 * Run: npx tsx apps/api/scripts/add-honeyville-dec-transactions.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
import { eq, and, sql, asc } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const CUSTOMER_ID = "c0162ec6-d1e7-4ab7-b3b9-ebdaf873bbc8";

const NEW_ENTRIES = [
  { date: "2025-12-09T00:00:00Z", ref: "Q2594", amount: "11000.00" },
  { date: "2025-12-15T00:00:00Z", ref: "Q2951", amount: "9600.00" },
  { date: "2025-12-20T00:00:00Z", ref: "Q2961", amount: "2875.00" },
];

async function main() {
  console.log("=== Add Honeyville Construction December 2025 Transactions ===\n");

  // Check idempotency — skip if already inserted
  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions
        WHERE customer_id = ${CUSTOMER_ID} AND reference_number IN ('Q2594', 'Q2951', 'Q2961')`
  ) as any[];

  if (existing.length > 0) {
    console.log(`Already have ${existing.length} of 3 entries (${existing.map((r: any) => r.reference_number).join(", ")}). Skipping.`);
    process.exit(0);
  }

  // Insert the 3 new transactions (balance_after will be recalculated below)
  for (const entry of NEW_ENTRIES) {
    await db.insert(customerTransactions).values({
      orgId: ORG_ID,
      customerId: CUSTOMER_ID,
      type: "CHARGE",
      amount: entry.amount,
      balanceAfter: "0", // placeholder — recalculated next
      referenceType: "credit_sale",
      referenceNumber: entry.ref,
      notes: "Credit Sale",
      recordedAt: new Date(entry.date),
    });
    console.log(`  Inserted CHARGE ${entry.ref} ₱${entry.amount} on ${entry.date.slice(0, 10)}`);
  }

  // Recalculate all balance_after values in chronological order
  const allTxns = await db
    .select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(eq(customerTransactions.customerId, CUSTOMER_ID))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let runningBalance = 0;
  for (const txn of allTxns) {
    const amt = parseFloat(txn.amount);
    if (txn.type === "CHARGE" || (txn.type === "ADJUSTMENT" && amt > 0)) {
      runningBalance += amt;
    } else {
      runningBalance -= Math.abs(amt);
    }
    await db.update(customerTransactions)
      .set({ balanceAfter: runningBalance.toFixed(2) })
      .where(eq(customerTransactions.id, txn.id));
  }
  console.log(`\n  Recalculated balance_after for ${allTxns.length} transactions`);
  console.log(`  Final running balance: ₱${runningBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  // Update customer totals
  const newTotal = (33060 + 23475).toFixed(2); // 56535.00
  await db.update(customers)
    .set({
      currentBalance: runningBalance.toFixed(2),
      totalPurchases: newTotal,
    })
    .where(eq(customers.id, CUSTOMER_ID));

  console.log(`  Updated customer: currentBalance=${runningBalance.toFixed(2)}, totalPurchases=${newTotal}`);

  // Verify
  const [cust] = await db.select({ name: customers.name, balance: customers.currentBalance, total: customers.totalPurchases })
    .from(customers).where(eq(customers.id, CUSTOMER_ID));
  console.log(`\n  Verification: ${cust.name} — Balance: ₱${cust.balance}, Total: ₱${cust.total}`);

  const finalTxns = await db
    .select({ ref: customerTransactions.referenceNumber, amount: customerTransactions.amount, balanceAfter: customerTransactions.balanceAfter, date: customerTransactions.recordedAt })
    .from(customerTransactions)
    .where(eq(customerTransactions.customerId, CUSTOMER_ID))
    .orderBy(asc(customerTransactions.recordedAt));

  console.log(`\n  Ledger (${finalTxns.length} transactions):`);
  for (const t of finalTxns) {
    console.log(`    ${new Date(t.date).toISOString().slice(0, 10)}  ${(t.ref ?? "").padEnd(12)} ₱${parseFloat(t.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 }).padStart(12)}  balance: ₱${parseFloat(t.balanceAfter).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  }

  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
