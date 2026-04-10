/**
 * Add 5 supplier invoices for West Elm Tree Sales Corp.
 * Run: npx tsx apps/api/scripts/add-west-elm-invoices.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { suppliers, supplierInvoices } from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const SUPPLIER_NAME = "West Elm Tree Sales Corp";

const INVOICES = [
  { invoiceNumber: "255317", invoiceDate: "2025-12-06", amount: "49032.00" },
  { invoiceNumber: "255399", invoiceDate: "2025-12-06", amount: "46757.28" },
  { invoiceNumber: "258039", invoiceDate: "2026-01-06", amount: "90720.00" },
  { invoiceNumber: "261046", invoiceDate: "2026-01-23", amount: "27360.00" },
  { invoiceNumber: "264868", invoiceDate: "2026-02-20", amount: "145440.00" },
];

async function main() {
  console.log("=== Add West Elm Tree Sales Corp Invoices ===\n");

  // 1. Find or create supplier
  let [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.orgId, ORG_ID), eq(suppliers.name, SUPPLIER_NAME)))
    .limit(1);

  if (!supplier) {
    // Try case-insensitive match
    const [found] = await db.execute(
      sql`SELECT id, name FROM suppliers WHERE org_id = ${ORG_ID} AND LOWER(name) = LOWER(${SUPPLIER_NAME}) LIMIT 1`
    ) as any[];

    if (found) {
      supplier = { id: found.id, name: found.name };
      console.log(`Found supplier (case-insensitive): ${supplier.name} (${supplier.id})`);
    } else {
      // Create new supplier
      const [created] = await db
        .insert(suppliers)
        .values({
          orgId: ORG_ID,
          name: SUPPLIER_NAME,
          mnemonicCode: "WE",
        })
        .returning({ id: suppliers.id, name: suppliers.name });
      supplier = created;
      console.log(`Created supplier: ${supplier.name} (${supplier.id})`);
    }
  } else {
    console.log(`Found supplier: ${supplier.name} (${supplier.id})`);
  }

  // 2. Insert invoices (idempotent — skip existing by invoice number)
  let inserted = 0;
  let skipped = 0;

  for (const inv of INVOICES) {
    // Check if already exists
    const [existing] = await db.execute(
      sql`SELECT id FROM supplier_invoices
          WHERE org_id = ${ORG_ID}
            AND supplier_id = ${supplier.id}
            AND invoice_number = ${inv.invoiceNumber}
          LIMIT 1`
    ) as any[];

    if (existing) {
      console.log(`  SKIP ${inv.invoiceNumber} — already exists`);
      skipped++;
      continue;
    }

    // Calculate due date (30 days from invoice date)
    const invDate = new Date(inv.invoiceDate);
    const dueDate = new Date(invDate);
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    await db.insert(supplierInvoices).values({
      orgId: ORG_ID,
      supplierId: supplier.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: dueDateStr,
      totalAmount: inv.amount,
      paidAmount: "0",
      balance: inv.amount,
      status: "OPEN",
      paymentTermsDays: 30,
      currency: "PHP",
      notes: `Imported via script`,
    });

    console.log(`  ADD ${inv.invoiceNumber}  ${inv.invoiceDate}  PHP ${parseFloat(inv.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
    inserted++;
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
  console.log(`Total invoice value: PHP ${INVOICES.reduce((s, i) => s + parseFloat(i.amount), 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
