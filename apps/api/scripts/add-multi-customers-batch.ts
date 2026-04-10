/**
 * Add transactions for Oscar Reyes Trucking, Atlantic Grains, J Poon Realty Corp.
 * Run: npx tsx apps/api/scripts/add-multi-customers-batch.ts
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

const BATCHES = [
  {
    search: "%oscar reyes%",
    entries: [
      { date: "2025-12-16T00:00:00Z", ref: "Q2915", amount: "150.00" },
      { date: "2025-12-17T00:00:00Z", ref: "Q2925", amount: "750.00" },
      { date: "2025-12-19T00:00:00Z", ref: "Q2941", amount: "2500.00" },
    ],
  },
  {
    search: "%atlantic grain%",
    createName: "Atlantic Grains",
    entries: [
      { date: "2025-09-03T00:00:00Z", ref: "Q1893", amount: "5900.00" },
      { date: "2025-10-13T00:00:00Z", ref: "Q2328", amount: "6500.00" },
    ],
  },
  {
    search: "%j poon%",
    createName: "J Poon Realty Corp",
    entries: [
      { date: "2025-05-19T00:00:00Z", ref: "Q0747", amount: "9500.00" },
    ],
  },
];

async function processCustomer(batch: typeof BATCHES[0]) {
  let [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, batch.search)))
    .limit(1);

  if (!customer && batch.createName) {
    const [created] = await db.insert(customers).values({
      orgId: ORG_ID, name: batch.createName, phone: `AR-${batch.createName.replace(/[^A-Z]/gi, "").slice(0, 8).toUpperCase()}`,
      customerType: "COMPANY", currentBalance: "0", totalPurchases: "0", isActive: true,
    } as any).returning({ id: customers.id, name: customers.name, balance: customers.currentBalance });
    customer = created;
    console.log(`  Created: ${customer.name}`);
  }

  if (!customer) { console.log(`  NOT FOUND: ${batch.search}`); return; }
  console.log(`  Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);

  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${customer.id} AND reference_number IN (${sql.join(batch.entries.map(e => sql`${e.ref}`), sql`,`)})`
  ) as any[];
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));

  let inserted = 0;
  for (const entry of batch.entries) {
    if (existingRefs.has(entry.ref)) { console.log(`    SKIP ${entry.ref}`); continue; }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID, customerId: customer.id, type: "CHARGE", amount: entry.amount,
      balanceAfter: "0", referenceType: "credit_sale", referenceNumber: entry.ref,
      notes: "Credit Sale", recordedAt: new Date(entry.date),
    });
    console.log(`    ADD ${entry.ref}  ${entry.date.slice(0, 10)}  ₱${parseFloat(entry.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
    inserted++;
  }

  if (inserted === 0) return;

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
  console.log(`    Recalc: ${allTxns.length} txns — balance: ₱${running.toFixed(2)}`);
}

async function main() {
  console.log("=== Add Multi-Customer Batch ===\n");
  for (const batch of BATCHES) {
    console.log(`\n--- ${batch.createName || batch.search} ---`);
    await processCustomer(batch);
  }
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
