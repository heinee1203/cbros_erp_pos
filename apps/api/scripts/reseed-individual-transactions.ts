/**
 * Replace aggregated AR-IMPORT entries with individual receipt transactions.
 * Run: npx tsx apps/api/scripts/reseed-individual-transactions.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
import { eq, and, sql, asc } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const NAME_ALIASES: Record<string, string> = { "BMEX - NAGA": "BMEX" };

// Extra December 2025 entries not in the main dataset
const EXTRA_ENTRIES = [
  { date: "December 9, 2025", name: "HONEYVILLE CONSTRUCTION", ref: "Q2594", amount: "11000.00" },
  { date: "December 15, 2025", name: "HONEYVILLE CONSTRUCTION", ref: "Q2951", amount: "9600.00" },
  { date: "December 20, 2025", name: "HONEYVILLE CONSTRUCTION", ref: "Q2961", amount: "2875.00" },
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s|[-/])(\w)/g, (_, pre, c) => pre + c.toUpperCase());
}

async function main() {
  console.log("=== Reseed Individual Receipt Transactions ===\n");

  // Step 1: Extract raw data from the existing seed script
  const seedFile = readFileSync(resolve(__dirname, "seed-customers-from-ar.ts"), "utf-8");
  const match = seedFile.match(/const RAW_DATA = `([\s\S]*?)`;/);
  if (!match) {
    console.error("Could not extract RAW_DATA from seed-customers-from-ar.ts");
    process.exit(1);
  }

  const rawLines = match[1].split("\n").filter((l) => l.trim());
  console.log(`Extracted ${rawLines.length} raw lines from seed script`);

  // Parse into records
  interface Record { date: Date; name: string; ref: string; amount: string; }
  const records: Record[] = [];

  // Add extra entries first
  for (const e of EXTRA_ENTRIES) {
    records.push({ date: new Date(e.date), name: e.name, ref: e.ref, amount: e.amount });
  }

  // Parse main data
  let talyerSkipped = 0;
  for (const line of rawLines) {
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    const [dateStr, rawName, ref, amountStr] = parts;
    const name = (NAME_ALIASES[rawName.trim()] ?? rawName.trim());

    if (name.toUpperCase().startsWith("TALYER")) { talyerSkipped++; continue; }

    records.push({
      date: new Date(dateStr.trim()),
      name,
      ref: ref.trim(),
      amount: (parseFloat(amountStr.trim()) || 0).toFixed(2),
    });
  }
  console.log(`Total records: ${records.length} (skipped ${talyerSkipped} TALYER)`);

  // Step 2: Build customer name → id lookup
  const allCustomers = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.orgId, ORG_ID));

  const nameMap = new Map<string, string>();
  for (const c of allCustomers) {
    nameMap.set(c.name.toUpperCase(), c.id);
  }

  // Step 3: Delete AR-IMPORT entries (preserve PAYMENT/CREDIT_NOTE/ADJUSTMENT)
  const [delResult] = await db.execute(
    sql`DELETE FROM customer_transactions
        WHERE org_id = ${ORG_ID}
          AND (reference_number = 'AR-IMPORT' OR notes LIKE '%Opening AR balance%')
        RETURNING id`
  ) as any;
  // Count deleted
  const deleted = await db.execute(
    sql`SELECT COUNT(*) FROM (
      SELECT 1 FROM customer_transactions WHERE org_id = ${ORG_ID} AND reference_number = 'AR-IMPORT'
    ) sub`
  );

  // Actually use a different approach since RETURNING with raw sql can be tricky
  const arImports = await db.execute(
    sql`SELECT id FROM customer_transactions
        WHERE org_id = ${ORG_ID}
          AND (reference_number = 'AR-IMPORT' OR notes LIKE '%Opening AR balance%')`
  ) as any[];

  if (arImports.length > 0) {
    await db.execute(
      sql`DELETE FROM customer_transactions
          WHERE org_id = ${ORG_ID}
            AND (reference_number = 'AR-IMPORT' OR notes LIKE '%Opening AR balance%')`
    );
    console.log(`\nDeleted ${arImports.length} AR-IMPORT entries`);
  } else {
    console.log("\nNo AR-IMPORT entries found (already cleaned)");
  }

  // Also delete the Honeyville Dec entries if they exist (they'll be re-inserted from EXTRA_ENTRIES)
  await db.execute(
    sql`DELETE FROM customer_transactions
        WHERE org_id = ${ORG_ID}
          AND customer_id = ${nameMap.get("HONEYVILLE CONSTRUCTION") ?? ""}
          AND reference_number IN ('Q2594', 'Q2951', 'Q2961')`
  );

  // Step 4: Get existing non-AR transactions (payments etc) to preserve
  const existingRefs = await db.execute(
    sql`SELECT customer_id, reference_number FROM customer_transactions WHERE org_id = ${ORG_ID}`
  ) as any[];
  const existingRefSet = new Set(existingRefs.map((r: any) => `${r.customer_id}|${r.reference_number}`));

  // Step 5: Insert individual transactions
  let inserted = 0;
  let skipped = 0;
  let notFound = 0;
  const missingNames = new Set<string>();

  for (const rec of records) {
    // Find customer
    const custId = nameMap.get(rec.name.toUpperCase()) || nameMap.get(titleCase(rec.name).toUpperCase());
    if (!custId) {
      missingNames.add(rec.name);
      notFound++;
      continue;
    }

    // Check if this specific receipt already exists
    const key = `${custId}|${rec.ref}`;
    if (existingRefSet.has(key)) {
      skipped++;
      continue;
    }

    await db.insert(customerTransactions).values({
      orgId: ORG_ID,
      customerId: custId,
      type: "CHARGE",
      amount: rec.amount,
      balanceAfter: "0", // placeholder
      referenceType: "credit_sale",
      referenceNumber: rec.ref,
      notes: "Credit Sale",
      recordedAt: rec.date,
    });
    existingRefSet.add(key);
    inserted++;
  }

  console.log(`Inserted: ${inserted} individual transactions`);
  console.log(`Skipped: ${skipped} (already existed)`);
  if (missingNames.size > 0) {
    console.log(`Not found: ${notFound} records for ${missingNames.size} names: ${[...missingNames].join(", ")}`);
  }

  // Step 6: Recalculate balance_after for ALL customers with transactions
  const affectedCustomers = await db.execute(
    sql`SELECT DISTINCT customer_id FROM customer_transactions WHERE org_id = ${ORG_ID}`
  ) as any[];

  let totalBalance = 0;
  for (const row of affectedCustomers) {
    const custId = row.customer_id;

    const txns = await db
      .select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
      .from(customerTransactions)
      .where(and(eq(customerTransactions.customerId, custId), eq(customerTransactions.orgId, ORG_ID)))
      .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

    let running = 0;
    for (const txn of txns) {
      const amt = parseFloat(txn.amount);
      if (txn.type === "CHARGE" || (txn.type === "ADJUSTMENT" && amt > 0)) {
        running += amt;
      } else {
        running -= Math.abs(amt);
      }
      await db.update(customerTransactions)
        .set({ balanceAfter: running.toFixed(2) })
        .where(eq(customerTransactions.id, txn.id));
    }

    // Update customer balance
    await db.update(customers)
      .set({ currentBalance: running.toFixed(2) })
      .where(eq(customers.id, custId));

    totalBalance += running;
  }

  console.log(`\nRecalculated balances for ${affectedCustomers.length} customers`);
  console.log(`Total AR receivables: \u20B1${totalBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  // Step 7: Verify Honeyville
  const hvId = nameMap.get("HONEYVILLE CONSTRUCTION");
  if (hvId) {
    const hvTxns = await db
      .select({ ref: customerTransactions.referenceNumber, amount: customerTransactions.amount, bal: customerTransactions.balanceAfter, date: customerTransactions.recordedAt })
      .from(customerTransactions)
      .where(eq(customerTransactions.customerId, hvId))
      .orderBy(asc(customerTransactions.recordedAt));
    console.log(`\nHoneyville Construction (${hvTxns.length} transactions):`);
    for (const t of hvTxns) {
      console.log(`  ${new Date(t.date).toISOString().slice(0, 10)}  ${(t.ref ?? "").padEnd(10)} \u20B1${parseFloat(t.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 }).padStart(12)}  bal: \u20B1${parseFloat(t.bal).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  }
  }

  // Verify no AR-IMPORT remains
  const remaining = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM customer_transactions WHERE org_id = ${ORG_ID} AND reference_number = 'AR-IMPORT'`
  ) as any[];
  console.log(`\nAR-IMPORT entries remaining: ${remaining[0]?.c ?? 0}`);

  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
