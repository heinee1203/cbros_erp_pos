/**
 * Merge "Cabral, Eric" into "Cabral, Eric Alfred" — move all transactions, then deactivate the old customer.
 * Run: npx tsx apps/api/scripts/merge-cabral-eric.ts
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
  console.log("=== Merge Cabral, Eric → Cabral, Eric Alfred ===\n");

  // Find both customers
  const allCabrals = await db
    .select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%cabral%eric%")));

  const source = allCabrals.find((c) => c.name.toLowerCase() === "cabral, eric");
  const dest = allCabrals.find((c) => c.name.toLowerCase().includes("alfred"));

  if (!source) { console.error("Source 'Cabral, Eric' not found!"); console.log("Found:", allCabrals.map(c => c.name)); process.exit(1); }
  if (!dest) { console.error("Dest 'Cabral, Eric Alfred' not found!"); console.log("Found:", allCabrals.map(c => c.name)); process.exit(1); }

  console.log(`Source: ${source.name} (${source.id}) — Balance: ${source.balance}`);
  console.log(`Dest:   ${dest.name} (${dest.id}) — Balance: ${dest.balance}`);

  // Count source transactions
  const [srcCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM customer_transactions WHERE customer_id = ${source.id}`) as any[];
  console.log(`\nSource has ${srcCount.cnt} transactions to move`);

  if (parseInt(srcCount.cnt) === 0) {
    console.log("No transactions to move. Just deactivating source.");
  } else {
    // Move all transactions from source to dest
    await db.execute(sql`
      UPDATE customer_transactions
      SET customer_id = ${dest.id}, billed = false, billed_soa_id = NULL
      WHERE customer_id = ${source.id}
    `);
    console.log(`Moved ${srcCount.cnt} transactions to ${dest.name}`);
  }

  // Move any SOA records
  const [soaCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM soa_records WHERE customer_id = ${source.id}`) as any[];
  if (parseInt(soaCount.cnt) > 0) {
    await db.execute(sql`UPDATE soa_records SET customer_id = ${dest.id} WHERE customer_id = ${source.id}`);
    console.log(`Moved ${soaCount.cnt} SOA records`);
  }

  // Recalculate dest customer balances
  const allTxns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions).where(eq(customerTransactions.customerId, dest.id))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let running = 0;
  for (const t of allTxns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) running += amt;
    else running -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: running.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  const [totals] = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM customer_transactions WHERE customer_id = ${dest.id} AND type = 'CHARGE'`) as any[];
  await db.update(customers).set({ currentBalance: running.toFixed(2), totalPurchases: parseFloat(totals.total).toFixed(2) }).where(eq(customers.id, dest.id));

  console.log(`\nRecalculated ${allTxns.length} txns for ${dest.name}`);
  console.log(`  Balance: ₱${running.toFixed(2)}, TotalPurchases: ₱${parseFloat(totals.total).toFixed(2)}`);

  // Deactivate source customer
  await db.update(customers).set({ isActive: false, currentBalance: "0", totalPurchases: "0" } as any).where(eq(customers.id, source.id));
  console.log(`\nDeactivated: ${source.name}`);

  console.log("\nDone!");
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
