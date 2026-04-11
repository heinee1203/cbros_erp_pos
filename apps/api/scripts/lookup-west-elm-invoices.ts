import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const supp = (await db.execute(sql`
  SELECT id, name, contact_phone
  FROM suppliers
  WHERE name ILIKE '%west elm%' OR name ILIKE '%west%elm%tree%'
`)) as any[];
console.log("West Elm supplier candidates:");
console.table(supp);

if (supp.length === 0) {
  console.log("No matching supplier");
  process.exit(0);
}
const s = supp[0];

// Per-status counts
const counts = (await db.execute(sql`
  SELECT status, COUNT(*)::int AS n, COALESCE(SUM(balance::numeric),0)::text AS total_balance
  FROM supplier_invoices
  WHERE supplier_id = ${s.id}
  GROUP BY status
  ORDER BY status
`)) as any[];
console.log(`\nInvoice counts by status for ${s.name}:`);
console.table(counts);

// Actual OPEN / PARTIALLY_PAID rows
const invs = (await db.execute(sql`
  SELECT id, invoice_number, invoice_date::text, due_date::text,
         total_amount::text, paid_amount::text, balance::text, status
  FROM supplier_invoices
  WHERE supplier_id = ${s.id}
    AND status IN ('OPEN','PARTIALLY_PAID')
  ORDER BY invoice_date
`)) as any[];
console.log(`\nOPEN + PARTIALLY_PAID invoices for ${s.name}: ${invs.length}`);
console.table(invs);

process.exit(0);
