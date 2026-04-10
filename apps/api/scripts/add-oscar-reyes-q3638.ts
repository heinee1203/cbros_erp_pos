/**
 * Add Q3638 CHARGE for Oscar Reyes Trucking.
 * Run: npx tsx apps/api/scripts/add-oscar-reyes-q3638.ts
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

async function main() {
  console.log("=== Add Oscar Reyes Trucking Q3638 ===\n");

  const [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%oscar reyes%")))
    .limit(1);

  if (!customer) { console.error("Customer not found!"); process.exit(1); }
  console.log(`Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);

  const [existing] = await db.execute(sql`SELECT id FROM customer_transactions WHERE customer_id = ${customer.id} AND reference_number = 'Q3638' LIMIT 1`) as any[];
  if (existing) { console.log("Q3638 already exists. Skipping."); process.exit(0); }

  await db.insert(customerTransactions).values({
    orgId: ORG_ID, customerId: customer.id, type: "CHARGE", amount: "1800.00",
    balanceAfter: "0", referenceType: "credit_sale", referenceNumber: "Q3638",
    notes: "Credit Sale", recordedAt: new Date("2026-03-04T00:00:00Z"),
  });
  console.log("  ADD CHARGE Q3638  2026-03-04  ₱1,800.00");

  const allTxns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions).where(eq(customerTransactions.customerId, customer.id))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let running = 0;
  for (const t of allTxns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) running += amt;
    else running -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: running.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  const [totals] = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM customer_transactions WHERE customer_id = ${customer.id} AND type = 'CHARGE'`) as any[];
  await db.update(customers).set({ currentBalance: running.toFixed(2), totalPurchases: parseFloat(totals.total).toFixed(2) }).where(eq(customers.id, customer.id));

  console.log(`\nRecalculated ${allTxns.length} txns — balance: ₱${running.toFixed(2)}, totalPurchases: ₱${parseFloat(totals.total).toFixed(2)}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
