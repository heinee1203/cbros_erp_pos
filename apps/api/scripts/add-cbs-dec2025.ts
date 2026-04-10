/**
 * Add 10 CHARGE transactions for CBS (December 2025).
 * Run: npx tsx apps/api/scripts/add-cbs-dec2025.ts
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
  { date: "2025-12-01T00:00:00Z", ref: "Q2503", amount: "9500.00" },
  { date: "2025-12-04T00:00:00Z", ref: "Q2527", amount: "450.00" },
  { date: "2025-12-06T00:00:00Z", ref: "Q2547", amount: "3400.00" },
  { date: "2025-12-09T00:00:00Z", ref: "Q2811", amount: "1580.00" },
  { date: "2025-12-10T00:00:00Z", ref: "Q2816", amount: "11640.00" },
  { date: "2025-12-15T00:00:00Z", ref: "Q2906", amount: "6000.00" },
  { date: "2025-12-16T00:00:00Z", ref: "Q2913", amount: "1950.00" },
  { date: "2025-12-19T00:00:00Z", ref: "Q2942", amount: "14450.00" },
  { date: "2025-12-22T00:00:00Z", ref: "Q3014", amount: "3110.00" },
  { date: "2025-12-23T00:00:00Z", ref: "Q2857", amount: "2400.00" },
];

const REFS = NEW_ENTRIES.map(e => e.ref);

async function main() {
  console.log("=== Add CBS December 2025 Transactions ===\n");

  const [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), eq(customers.name, "CBS")))
    .limit(1);

  if (!customer) {
    // Try partial match
    const [alt] = await db.select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
      .from(customers).where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "cbs%"))).limit(1);
    if (!alt) { console.error("Customer CBS not found!"); process.exit(1); }
    console.log(`Found: ${alt.name} (${alt.id}) — Balance: ${alt.balance}`);
    Object.assign(customer!, alt);
  }
  if (customer) console.log(`Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);

  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${customer!.id} AND reference_number IN (${sql.join(REFS.map(r => sql`${r}`), sql`,`)})`
  ) as any[];
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));

  let inserted = 0;
  for (const entry of NEW_ENTRIES) {
    if (existingRefs.has(entry.ref)) { console.log(`  SKIP ${entry.ref}`); continue; }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID, customerId: customer!.id, type: "CHARGE", amount: entry.amount,
      balanceAfter: "0", referenceType: "credit_sale", referenceNumber: entry.ref,
      notes: "Credit Sale", recordedAt: new Date(entry.date),
    });
    console.log(`  ADD ${entry.ref}  ${entry.date.slice(0, 10)}  ₱${parseFloat(entry.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
    inserted++;
  }

  if (inserted === 0) { console.log("\nNothing to insert."); process.exit(0); }

  const allTxns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions).where(eq(customerTransactions.customerId, customer!.id))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let running = 0;
  for (const t of allTxns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) running += amt;
    else running -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: running.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  const [totals] = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM customer_transactions WHERE customer_id = ${customer!.id} AND type = 'CHARGE'`) as any[];
  await db.update(customers).set({ currentBalance: running.toFixed(2), totalPurchases: parseFloat(totals.total).toFixed(2) }).where(eq(customers.id, customer!.id));

  console.log(`\nRecalculated ${allTxns.length} txns — balance: ₱${running.toFixed(2)}, totalPurchases: ₱${parseFloat(totals.total).toFixed(2)}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
