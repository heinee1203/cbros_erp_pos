/**
 * Delete 3 test customers with no AR activity.
 * Run: npx tsx apps/api/scripts/delete-test-customers.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const NAMES = ["Lucas Alfred Cabral", "Juan Dela Cruz", "Christianne Cabral"];

async function main() {
  console.log("=== Delete Test Customers ===\n");

  for (const name of NAMES) {
    const [cust] = await db.execute(sql`SELECT id, name, current_balance FROM customers WHERE name = ${name} AND current_balance::numeric = 0`) as any[];
    if (!cust) { console.log(`  ${name}: not found or has balance. Skipping.`); continue; }

    // Clean related records
    await db.execute(sql`DELETE FROM soa_line_items WHERE soa_id IN (SELECT id FROM soa_records WHERE customer_id = ${cust.id})`);
    await db.execute(sql`DELETE FROM soa_records WHERE customer_id = ${cust.id}`);
    await db.execute(sql`DELETE FROM customer_transactions WHERE customer_id = ${cust.id}`);
    await db.execute(sql`DELETE FROM customers WHERE id = ${cust.id}`);
    console.log(`  ${name}: deleted`);
  }

  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
