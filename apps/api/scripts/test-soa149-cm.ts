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
  if (!soa) { console.log("Not found"); process.exit(1); }
  // Check raw soa_line_items
  const lines = await db.execute(sql`
    SELECT ct.reference_number, ct.type, ct.amount FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id WHERE sli.soa_id = ${soa.id}
    ORDER BY ct.recorded_at
  `) as any[];
  console.log(`Raw soa_line_items: ${lines.length}`);
  for (const l of lines) console.log(`  ${l.reference_number} ${l.type} ${l.amount}`);
  // Check API output
  const invoices = await getSOAInvoices(soa.id, ORG_ID);
  console.log(`\ngetSOAInvoices: ${invoices.length}`);
  const hasCM = invoices.some((i: any) => i.type === "CREDIT_NOTE");
  console.log(`Has CREDIT_NOTE: ${hasCM}`);
  for (const i of invoices) if (i.type === "CREDIT_NOTE") console.log(`  CM: ${i.referenceNumber} -${i.amount}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
