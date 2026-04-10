/**
 * Merge Aky Construction into Aky Coco Lumber.
 * Run: npx tsx apps/api/scripts/merge-aky-construction.ts
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

async function main() {
  console.log("=== Merge Aky Construction → Aky Coco Lumber ===\n");

  const [source] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) LIKE '%AKY CONSTRUCTION%'`));

  if (!source) { console.log("Aky Construction not found (already merged or doesn't exist). Done."); process.exit(0); }

  const [target] = await db.select({ id: customers.id, name: customers.name, balance: customers.currentBalance, total: customers.totalPurchases })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) LIKE '%AKY COCO LUMBER%'`));

  if (!target) { console.error("Aky Coco Lumber not found!"); process.exit(1); }

  console.log(`Source: ${source.name} (${source.id})`);
  console.log(`Target: ${target.name} (${target.id})\n`);

  // Move transactions
  const [movedTxns] = await db.execute(sql`
    UPDATE customer_transactions SET customer_id = ${target.id}
    WHERE customer_id = ${source.id} AND org_id = ${ORG_ID}
    RETURNING id
  `) as any;
  // Count via separate query
  const txnCount = await db.execute(sql`SELECT COUNT(*)::int AS c FROM customer_transactions WHERE customer_id = ${target.id} AND org_id = ${ORG_ID}`) as any[];

  // Move SOA records
  await db.execute(sql`UPDATE soa_records SET customer_id = ${target.id} WHERE customer_id = ${source.id} AND org_id = ${ORG_ID}`);

  console.log(`Moved transactions to ${target.name}`);

  // Recalculate balance_after
  const txns = await db
    .select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(and(eq(customerTransactions.customerId, target.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0;
  let totalCharges = 0;
  for (const t of txns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) { bal += amt; totalCharges += amt; }
    else bal -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  await db.update(customers).set({ currentBalance: bal.toFixed(2), totalPurchases: totalCharges.toFixed(2) }).where(eq(customers.id, target.id));

  // Delete source customer
  await db.delete(customers).where(eq(customers.id, source.id));

  console.log(`Recalculated ${txns.length} transactions`);
  console.log(`${target.name}: balance=\u20B1${bal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}, totalPurchases=\u20B1${totalCharges.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  console.log(`Deleted: ${source.name}`);

  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
