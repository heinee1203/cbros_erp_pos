/**
 * Merge Dy, Reynauld into Five Starex Commercial.
 * Run: npx tsx apps/api/scripts/merge-dy-reynauld.ts
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
  console.log("=== Merge Dy, Reynauld → Five Starex Commercial ===\n");

  const [source] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'DY, REYNAULD'`));
  if (!source) { console.log("Dy, Reynauld not found (already merged). Done."); process.exit(0); }

  const [target] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'FIVE STAREX COMMERCIAL'`));
  if (!target) { console.error("Five Starex Commercial not found!"); process.exit(1); }

  console.log(`Source: ${source.name} (${source.id})`);
  console.log(`Target: ${target.name} (${target.id})\n`);

  await db.execute(sql`UPDATE customer_transactions SET customer_id = ${target.id} WHERE customer_id = ${source.id} AND org_id = ${ORG_ID}`);
  await db.execute(sql`UPDATE soa_records SET customer_id = ${target.id} WHERE customer_id = ${source.id} AND org_id = ${ORG_ID}`);

  const txns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(and(eq(customerTransactions.customerId, target.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0, tot = 0;
  for (const t of txns) {
    const a = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && a > 0)) { bal += a; tot += a; } else bal -= Math.abs(a);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  await db.update(customers).set({ currentBalance: bal.toFixed(2), totalPurchases: tot.toFixed(2) }).where(eq(customers.id, target.id));
  await db.delete(customers).where(eq(customers.id, source.id));

  console.log(`Recalculated ${txns.length} transactions`);
  console.log(`${target.name}: balance=\u20B1${bal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}, total=\u20B1${tot.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  console.log(`Deleted: ${source.name}`);
  process.exit(0);
}
main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
