/**
 * Test the settled-invoices endpoint logic for PAY-2026-0042.
 * Run: npx tsx apps/api/scripts/test-settled-invoices-api.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { getPaymentSettledInvoices } from "../src/modules/customers/service";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  // Find PAY-2026-0042
  const [pay] = await db.execute(sql`SELECT id FROM customer_transactions WHERE payment_number = 'PAY-2026-0042'`) as any[];
  if (!pay) { console.log("NOT FOUND"); process.exit(1); }

  const result = await getPaymentSettledInvoices(pay.id, ORG_ID);
  console.log(`getPaymentSettledInvoices returned ${result.length} rows:`);
  for (const r of result) {
    console.log(`  ${r.referenceNumber}  ${r.amount}`);
  }

  if (result.length === 0) {
    console.log("\nFAIL: No invoices returned. Receipt will be empty.");
  } else {
    console.log("\nPASS: Invoices will appear on receipt.");
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
