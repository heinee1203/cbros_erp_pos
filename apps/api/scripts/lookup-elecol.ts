import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const cust = (await db.execute(sql`
  SELECT id, org_id, name, phone, current_balance::text, is_active
  FROM customers
  WHERE name ILIKE '%elecol%'
`)) as any[];
console.log("ELECOL candidates:");
console.table(cust);

if (cust.length === 0) {
  console.log("No customer found");
  process.exit(1);
}

const c = cust[0];

// Duplicate check
const dup = (await db.execute(sql`
  SELECT ct.reference_number, ct.type, ct.amount::text, c.name, ct.recorded_at::text
  FROM customer_transactions ct
  JOIN customers c ON c.id = ct.customer_id
  WHERE ct.reference_number IN ('Q2274','Q2293','Q2792','Q2815')
`)) as any[];
console.log("\nExisting rows for target refs (should be empty):");
console.table(dup);

// Total count
const [cnt] = (await db.execute(sql`
  SELECT COUNT(*)::int AS n FROM customer_transactions WHERE customer_id = ${c.id}
`)) as any[];
console.log(`\nTotal existing ELECOL transactions: ${cnt.n}`);

// Anything on or before 2025-10-06 (predecessor territory)?
const before = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${c.id}
    AND recorded_at < '2025-10-06T16:00:00Z'::timestamptz
  ORDER BY recorded_at DESC, id DESC
  LIMIT 5
`)) as any[];
console.log("\nLast 5 transactions BEFORE 2025-10-06 16:00 UTC (predecessor territory):");
console.table(before);

// Anything in the insert window (Oct 6 2025 - Dec 9 2025) that would interleave?
const interleave = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${c.id}
    AND recorded_at >= '2025-10-06'::timestamptz
    AND recorded_at <= '2025-12-10'::timestamptz
  ORDER BY recorded_at ASC, id ASC
`)) as any[];
console.log(`\nExisting transactions interleaving the window (Oct 6 – Dec 10 2025): ${interleave.length}`);
console.table(interleave);

// Anything strictly after the last insert point (Dec 9 16:00)?
const later = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${c.id}
    AND recorded_at > '2025-12-09T16:00:00Z'::timestamptz
  ORDER BY recorded_at ASC, id ASC
  LIMIT 20
`)) as any[];
console.log(`\nFirst 20 rows strictly AFTER 2025-12-09 16:00 UTC (will rewind): ${later.length}`);
console.table(later);

// Last txn overall (sanity — should match customer current_balance)
const [lastTxn] = (await db.execute(sql`
  SELECT type, reference_number, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${c.id}
  ORDER BY recorded_at DESC, id DESC
  LIMIT 1
`)) as any[];
console.log("\nLast transaction overall (balance_after should match current_balance):");
console.table([lastTxn]);

process.exit(0);
