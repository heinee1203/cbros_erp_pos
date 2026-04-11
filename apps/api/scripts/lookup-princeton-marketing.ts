import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const REFS = [
  "Q1756", "Q1774",
  "Q2046", "Q2534", "Q2806", "Q2822", "Q2849", "Q2850",
  "Q2922", "Q2937", "Q3004", "Q3009", "Q3037",
  "CM-3027",
];

const cust = (await db.execute(sql`
  SELECT id, org_id, name, phone, current_balance::text, is_active
  FROM customers
  WHERE name ILIKE '%princeton%marketing%'
     OR name ILIKE '%princeton marketing%'
`)) as any[];
console.log("Princeton Marketing candidates:");
console.table(cust);

if (cust.length === 0) {
  console.log("No customer found");
  process.exit(1);
}

const c = cust[0];

// Duplicate check for all 14 refs
const dup = (await db.execute(sql`
  SELECT ct.reference_number, ct.type, ct.amount::text, c.name, ct.recorded_at::text
  FROM customer_transactions ct
  JOIN customers c ON c.id = ct.customer_id
  WHERE ct.reference_number IN (
    'Q1756','Q1774','Q2046','Q2534','Q2806','Q2822','Q2849','Q2850',
    'Q2922','Q2937','Q3004','Q3009','Q3037','CM-3027'
  )
`)) as any[];
console.log("\nExisting rows for these references (should be empty):");
console.table(dup);

// How many transactions does Princeton currently have?
const [cnt] = (await db.execute(sql`
  SELECT COUNT(*)::int AS n FROM customer_transactions WHERE customer_id = ${c.id}
`)) as any[];
console.log(`\nTotal existing Princeton transactions: ${cnt.n}`);

// Anything on or before 2025-08-15 (predecessor territory)?
const earliest = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${c.id}
    AND recorded_at < '2025-08-15'::timestamptz
  ORDER BY recorded_at DESC, id DESC
  LIMIT 5
`)) as any[];
console.log("\n5 most recent transactions BEFORE 2025-08-15 (predecessor territory):");
console.table(earliest);

// Anything between 2025-08-15 and 2025-12-31 that would interleave?
const interleave = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${c.id}
    AND recorded_at >= '2025-08-15'::timestamptz
    AND recorded_at <= '2025-12-31'::timestamptz
  ORDER BY recorded_at ASC, id ASC
`)) as any[];
console.log("\nExisting transactions that would interleave with the insert window (2025-08-15..2025-12-31):");
console.table(interleave);

// Anything strictly after 2025-12-30 (will need rewinding)?
const later = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${c.id}
    AND recorded_at > '2025-12-30T16:00:01Z'::timestamptz
  ORDER BY recorded_at ASC, id ASC
  LIMIT 20
`)) as any[];
console.log(`\nExisting transactions strictly AFTER 2025-12-30 (will need balance_after rewind): ${later.length}`);
console.table(later);

process.exit(0);
