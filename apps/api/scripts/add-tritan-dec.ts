/**
 * Add 4 CHARGE transactions for Tritan.
 * Run: npx tsx apps/api/scripts/add-tritan-dec.ts
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
  { date: "2025-12-04T00:00:00Z", ref: "Q2528", amount: "1820.00" },
  { date: "2025-12-04T00:00:00Z", ref: "Q2529", amount: "360.00" },
  { date: "2025-12-27T00:00:00Z", ref: "Q3028", amount: "150.00" },
  { date: "2025-12-29T00:00:00Z", ref: "Q3035", amount: "240.00" },
];

async function main() {
  console.log("=== Add Tritan December Transactions ===\n");

  let [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%tritan%")))
    .limit(1);

  if (!customer) {
    const [created] = await db.insert(customers).values({
      orgId: ORG_ID, name: "Tritan", phone: "N/A", customerType: "COMPANY", currentBalance: "0", totalPurchases: "0", isActive: true,
    } as any).returning({ id: customers.id, name: customers.name, balance: customers.currentBalance });
    customer = created;
    console.log(`Created: ${customer.name} (${customer.id})`);
  } else {
    console.log(`Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);
  }

  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${customer.id} AND reference_number IN ('Q2528','Q2529','Q3028','Q3035')`
  ) as any[];
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));

  let inserted = 0;
  for (const entry of NEW_ENTRIES) {
    if (existingRefs.has(entry.ref)) { console.log(`  SKIP ${entry.ref}`); continue; }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID, customerId: customer.id, type: "CHARGE", amount: entry.amount,
      balanceAfter: "0", referenceType: "credit_sale", referenceNumber: entry.ref,
      notes: "Credit Sale", recordedAt: new Date(entry.date),
    });
    console.log(`  ADD ${entry.ref}  ${entry.date.slice(0, 10)}  ₱${parseFloat(entry.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
    inserted++;
  }

  if (inserted === 0) { console.log("\nNothing to insert."); process.exit(0); }

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
