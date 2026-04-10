/**
 * Add 17 CHARGE transactions for RT Montana.
 * Run: npx tsx apps/api/scripts/add-rt-montana-dec.ts
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
  { date: "2025-12-01T00:00:00Z", ref: "Q2502", amount: "250.00" },
  { date: "2025-12-03T00:00:00Z", ref: "Q2513", amount: "550.00" },
  { date: "2025-12-03T00:00:00Z", ref: "Q2514", amount: "650.00" },
  { date: "2025-12-03T00:00:00Z", ref: "Q2519", amount: "350.00" },
  { date: "2025-12-04T00:00:00Z", ref: "Q2532", amount: "650.00" },
  { date: "2025-12-06T00:00:00Z", ref: "Q2543", amount: "3060.00" },
  { date: "2025-12-08T00:00:00Z", ref: "Q2804", amount: "9800.00" },
  { date: "2025-12-09T00:00:00Z", ref: "Q2812", amount: "6200.00" },
  { date: "2025-12-09T00:00:00Z", ref: "Q2814", amount: "3200.00" },
  { date: "2025-12-09T00:00:00Z", ref: "Q2818", amount: "1900.00" },
  { date: "2025-12-09T00:00:00Z", ref: "Q2819", amount: "1850.00" },
  { date: "2025-12-10T00:00:00Z", ref: "Q2823", amount: "2800.00" },
  { date: "2025-12-16T00:00:00Z", ref: "Q2910", amount: "1870.00" },
  { date: "2025-12-19T00:00:00Z", ref: "Q2944", amount: "900.00" },
  { date: "2025-12-19T00:00:00Z", ref: "Q2945", amount: "1750.00" },
  { date: "2025-12-19T00:00:00Z", ref: "Q2946", amount: "515.00" },
  { date: "2025-12-19T00:00:00Z", ref: "Q2947", amount: "1600.00" },
];

async function main() {
  console.log("=== Add RT Montana December 2025 Transactions ===\n");

  let [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%rt montana%")))
    .limit(1);

  if (!customer) {
    const [created] = await db.insert(customers).values({
      orgId: ORG_ID, name: "RT Montana", phone: "AR-RTMONTANA", customerType: "COMPANY", currentBalance: "0", totalPurchases: "0", isActive: true,
    } as any).returning({ id: customers.id, name: customers.name, balance: customers.currentBalance });
    customer = created;
    console.log(`Created: ${customer.name} (${customer.id})`);
  } else {
    console.log(`Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);
  }

  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${customer.id} AND reference_number IN ('Q2502','Q2513','Q2514','Q2519','Q2532','Q2543','Q2804','Q2812','Q2814','Q2818','Q2819','Q2823','Q2910','Q2944','Q2945','Q2946','Q2947')`
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
