/**
 * Add 4 CHARGE transactions for Lucky Se7en, Inc.
 * Run: npx tsx apps/api/scripts/add-lucky-se7en.ts
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
  { date: "2025-10-11T00:00:00Z", ref: "Q2320", amount: "2300.00" },
  { date: "2025-10-22T00:00:00Z", ref: "Q2395", amount: "2500.00" },
  { date: "2025-12-15T00:00:00Z", ref: "Q2907", amount: "2500.00" },
  { date: "2025-12-22T00:00:00Z", ref: "Q3010", amount: "650.00" },
];

async function main() {
  console.log("=== Add Lucky Se7en, Inc Transactions ===\n");

  let [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%lucky%se7en%")))
    .limit(1);

  if (!customer) {
    const [created] = await db.insert(customers).values({
      orgId: ORG_ID, name: "Lucky Se7en, Inc", phone: "AR-LUCKYSE7EN", customerType: "COMPANY", currentBalance: "0", totalPurchases: "0", isActive: true,
    } as any).returning({ id: customers.id, name: customers.name, balance: customers.currentBalance });
    customer = created;
    console.log(`Created: ${customer.name} (${customer.id})`);
  } else {
    console.log(`Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);
  }

  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${customer.id} AND reference_number IN (${sql.join(NEW_ENTRIES.map(e => sql`${e.ref}`), sql`,`)})`
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
