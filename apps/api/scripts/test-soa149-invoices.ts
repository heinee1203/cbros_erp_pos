/**
 * Test getSOAInvoices for SOA-2026-0149.
 * Run: npx tsx apps/api/scripts/test-soa149-invoices.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { getSOAInvoices } from "../src/modules/customers/service";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  const [soa] = await db.execute(sql`SELECT id FROM soa_records WHERE soa_number = 'SOA-2026-0149'`) as any[];
  if (!soa) { console.log("SOA not found"); process.exit(1); }

  const invoices = await getSOAInvoices(soa.id, ORG_ID);
  console.log(`getSOAInvoices returned ${invoices.length} rows:\n`);
  for (const inv of invoices) {
    console.log(`  ${inv.referenceNumber}  ${inv.type}  amount:${inv.amount}  allocated:${inv.allocatedAmount}  remaining:${inv.remainingAmount}  status:${inv.paymentStatus}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
