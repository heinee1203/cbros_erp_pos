import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

console.log("=== Force CM apply — pre-flight lookup ===\n");

// Target SOAs
const soas = (await db.execute(sql`
  SELECT sr.id, sr.soa_number, sr.customer_id, c.name AS customer,
         sr.status, sr.date_from::text, sr.date_to::text,
         sr.total_charges::text, sr.total_credits::text,
         sr.total_payable::text, COALESCE(sr.paid_amount,0)::text AS paid_amount,
         sr.transaction_count
  FROM soa_records sr
  JOIN customers c ON c.id = sr.customer_id
  WHERE sr.soa_number IN ('SOA-2026-0070','SOA-2026-0072')
  ORDER BY sr.soa_number
`)) as any[];
console.log("Target SOAs:");
console.table(soas);

// Target credit memos
const cms = (await db.execute(sql`
  SELECT ct.id, ct.reference_number, ct.type, ct.amount::text,
         ct.billed, ct.billed_soa_id, ct.customer_id, c.name AS customer,
         ct.recorded_at::text
  FROM customer_transactions ct
  JOIN customers c ON c.id = ct.customer_id
  WHERE ct.reference_number IN ('CM-3591','CM-3593','CM-3018','CM-3019')
  ORDER BY ct.reference_number
`)) as any[];
console.log("\nTarget credit memos:");
console.table(cms);

// Check whether any of these CMs are already in soa_line_items anywhere
const existingLines = (await db.execute(sql`
  SELECT sli.soa_id, sr.soa_number, ct.reference_number
  FROM soa_line_items sli
  JOIN customer_transactions ct ON ct.id = sli.transaction_id
  JOIN soa_records sr ON sr.id = sli.soa_id
  WHERE ct.reference_number IN ('CM-3591','CM-3593','CM-3018','CM-3019')
`)) as any[];
console.log("\nExisting soa_line_items for these CMs (should be empty):");
console.table(existingLines);

// Check the schema of soa_line_items for any unique constraint
const lineItemConstraints = (await db.execute(sql`
  SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'soa_line_items'
    AND con.contype IN ('u','p')
`)) as any[];
console.log("\nsoa_line_items unique/primary constraints:");
console.table(lineItemConstraints);

// How many line items does each target SOA currently hold?
const lineCounts = (await db.execute(sql`
  SELECT sr.soa_number, COUNT(sli.id)::int AS line_count
  FROM soa_records sr
  LEFT JOIN soa_line_items sli ON sli.soa_id = sr.id
  WHERE sr.soa_number IN ('SOA-2026-0070','SOA-2026-0072')
  GROUP BY sr.soa_number
  ORDER BY sr.soa_number
`)) as any[];
console.log("\nCurrent line_item counts for target SOAs:");
console.table(lineCounts);

process.exit(0);
