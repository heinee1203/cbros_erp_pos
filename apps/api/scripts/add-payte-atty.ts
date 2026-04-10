/**
 * Add 2 CHARGE transactions for Payte, Atty.
 * Run: npx tsx apps/api/scripts/add-payte-atty.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
import { eq, and, sql, asc, ilike } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

const NEW_ENTRIES = [
  { date: "2026-03-06T00:00:00Z", ref: "Q2896", amount: "640.00" },
  { date: "2026-03-07T00:00:00Z", ref: "Q3562", amount: "3900.00" },
];

async function main() {
  console.log("=== Add Payte, Atty Transactions ===\n");

  // Find customer
  const [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance, total: customers.totalPurchases })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%payte%")))
    .limit(1);

  if (!customer) {
    console.error("Customer 'Payte, Atty' not found!");
    process.exit(1);
  }
  console.log(`Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);

  // Idempotency check
  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions
        WHERE customer_id = ${customer.id} AND reference_number IN ('Q2896', 'Q3562')`
  ) as any[];

  if (existing.length === 2) {
    console.log("Both Q2896 and Q3562 already exist. Skipping.");
    process.exit(0);
  }
  if (existing.length > 0) {
    console.log(`Already have: ${existing.map((r: any) => r.reference_number).join(", ")}`);
  }

  // Insert new transactions
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));
  for (const entry of NEW_ENTRIES) {
    if (existingRefs.has(entry.ref)) {
      console.log(`  SKIP ${entry.ref} — already exists`);
      continue;
    }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID,
      customerId: customer.id,
      type: "CHARGE",
      amount: entry.amount,
      balanceAfter: "0",
      referenceType: "credit_sale",
      referenceNumber: entry.ref,
      notes: "Credit Sale",
      recordedAt: new Date(entry.date),
    });
    console.log(`  ADD CHARGE ${entry.ref}  ${entry.date.slice(0, 10)}  ₱${parseFloat(entry.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  }

  // Recalculate all balance_after chronologically
  const allTxns = await db
    .select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(eq(customerTransactions.customerId, customer.id))
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
  console.log(`\nRecalculated ${allTxns.length} transactions — final balance: ₱${runningBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  // Sum total purchases (all CHARGE amounts)
  const [totals] = await db.execute(
    sql`SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM customer_transactions
        WHERE customer_id = ${customer.id} AND type = 'CHARGE'`
  ) as any[];
  const totalPurchases = parseFloat(totals.total).toFixed(2);

  await db.update(customers)
    .set({ currentBalance: runningBalance.toFixed(2), totalPurchases })
    .where(eq(customers.id, customer.id));

  console.log(`Updated customer: currentBalance=₱${runningBalance.toFixed(2)}, totalPurchases=₱${totalPurchases}`);
  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
