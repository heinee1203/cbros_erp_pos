/**
 * Add 10 CHARGE transactions for Cabral, Eric Alfred.
 * Run: npx tsx apps/api/scripts/add-cabral-eric-alfred.ts
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
  { date: "2025-09-15T00:00:00Z", ref: "Q1916", amount: "75.00" },
  { date: "2025-10-01T00:00:00Z", ref: "Q1928", amount: "2500.00" },
  { date: "2025-10-17T00:00:00Z", ref: "Q1947", amount: "1925.00" },
  { date: "2025-10-02T00:00:00Z", ref: "Q2010", amount: "11000.00" },
  { date: "2025-11-15T00:00:00Z", ref: "Q2032", amount: "42500.00" },
  { date: "2025-12-04T00:00:00Z", ref: "Q2043", amount: "75.00" },
  { date: "2025-11-13T00:00:00Z", ref: "Q2569", amount: "6300.00" },
  { date: "2025-11-25T00:00:00Z", ref: "Q2581", amount: "6500.00" },
  { date: "2025-12-04T00:00:00Z", ref: "Q2590", amount: "3000.00" },
  { date: "2025-12-06T00:00:00Z", ref: "Q2593", amount: "4310.00" },
];

async function main() {
  console.log("=== Add Cabral, Eric Alfred Transactions ===\n");

  const [customer] = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%cabral%eric%")))
    .limit(1);

  if (!customer) { console.error("Customer not found!"); process.exit(1); }
  console.log(`Found: ${customer.name} (${customer.id}) — Balance: ${customer.balance}`);

  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${customer.id} AND reference_number IN ('Q1916','Q1928','Q1947','Q2010','Q2032','Q2043','Q2569','Q2581','Q2590','Q2593')`
  ) as any[];
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));
  if (existingRefs.size > 0) console.log(`Already have: ${[...existingRefs].join(", ")}`);

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
