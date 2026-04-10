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
const ENTRIES = [
  { date: "2025-10-04", ref: "Q2260", amount: "295.00" },
  { date: "2025-10-10", ref: "Q2300", amount: "50.00" },
  { date: "2025-10-17", ref: "Q2359", amount: "420.00" },
  { date: "2025-10-17", ref: "Q2366", amount: "4800.00" },
  { date: "2025-10-18", ref: "Q2372", amount: "150.00" },
  { date: "2025-10-20", ref: "Q2382", amount: "385.00" },
  { date: "2025-10-24", ref: "Q2406", amount: "95.00" },
  { date: "2025-10-27", ref: "Q2426", amount: "4320.00" },
  { date: "2025-11-22", ref: "Q2734", amount: "720.00" },
  { date: "2025-11-24", ref: "Q2770", amount: "420.00" },
  { date: "2025-11-27", ref: "Q2743", amount: "2050.00" },
];

async function main() {
  const [cust] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'BICOL STEEL TOWER CORPORATION'`));
  if (!cust) { console.error("Not found"); process.exit(1); }

  let inserted = 0;
  for (const e of ENTRIES) {
    const ex = await db.execute(sql`SELECT id FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number = ${e.ref}`) as any[];
    if (ex.length > 0) { console.log(`${e.ref} exists, skip`); continue; }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID, customerId: cust.id, type: "CHARGE", amount: e.amount, balanceAfter: "0",
      referenceType: "credit_sale", referenceNumber: e.ref, notes: "Credit Sale", recordedAt: new Date(e.date),
    });
    inserted++;
  }

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
  console.log(`${cust.name}: inserted ${inserted}, ${txns.length} total txns, balance \u20B1${bal.toFixed(2)}, total \u20B1${tot.toFixed(2)}`);
  process.exit(0);
}
main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
