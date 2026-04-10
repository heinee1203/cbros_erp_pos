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
  const [cust] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'CBS'`));
  if (!cust) { console.error("Not found"); process.exit(1); }

  const ex = await db.execute(sql`SELECT id FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number = 'Q3636'`) as any[];
  if (ex.length > 0) { console.log("Q3636 already exists."); process.exit(0); }

  await db.insert(customerTransactions).values({
    orgId: ORG_ID, customerId: cust.id, type: "CHARGE", amount: "11380.00", balanceAfter: "0",
    referenceType: "credit_sale", referenceNumber: "Q3636", notes: "Credit Sale", recordedAt: new Date("2026-03-03"),
  });

  const txns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions).where(and(eq(customerTransactions.customerId, cust.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0, tot = 0;
  for (const t of txns) {
    const a = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && a > 0)) { bal += a; tot += a; } else bal -= Math.abs(a);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }
  await db.update(customers).set({ currentBalance: bal.toFixed(2), totalPurchases: tot.toFixed(2) }).where(eq(customers.id, cust.id));
  console.log(`CBS: Q3636 added. Balance \u20B1${bal.toFixed(2)}, Total \u20B1${tot.toFixed(2)}`);
  process.exit(0);
}
main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
