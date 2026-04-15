/**
 * Bulk import 1,009 supplier invoices from the purchases Excel workbook.
 *
 * Source: "purchases 2026 as of april 13.xlsx" — 4 columns (Date, Supplier, Invoice#, Amount)
 * Target: supplier_invoices table
 *
 * - Auto-creates missing suppliers
 * - Skips duplicates (same org + supplier + invoice_number)
 * - Due date = invoice_date + 30 days
 * - All invoices start as OPEN with balance = total_amount
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/import-supplier-invoices-2026.ts
 *   Apply:    npx tsx apps/api/scripts/import-supplier-invoices-2026.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import * as XLSX from "xlsx";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const XLSX_PATH = "C:/Users/Admin/OneDrive/Documents/purchases 2026 as of april 13.xlsx";

interface InvoiceRow {
  date: string;       // YYYY-MM-DD
  supplierName: string;
  invoiceNumber: string;
  amount: number;
  srcRow: number;
}

function excelSerialToISO(n: number): string | null {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`=== Import supplier invoices (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  if (!fs.existsSync(XLSX_PATH)) {
    console.error("ABORT: file not found:", XLSX_PATH);
    process.exit(1);
  }

  // Parse Excel
  const buf = fs.readFileSync(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });

  // Parse rows (no header row — data starts at row 0)
  const parsed: InvoiceRow[] = [];
  let skipped = 0;
  for (let i = 0; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.length < 4) { skipped++; continue; }

    const dateCell = r[0];
    let iso: string | null = null;
    if (typeof dateCell === "number") iso = excelSerialToISO(dateCell);
    else if (typeof dateCell === "string") {
      const d = new Date(dateCell);
      if (!isNaN(d.getTime())) iso = d.toISOString().slice(0, 10);
    }
    if (!iso) { skipped++; continue; }

    const supplierName = String(r[1] ?? "").trim();
    const invoiceNumber = String(r[2] ?? "").trim();
    const amount = typeof r[3] === "number" ? r[3] : parseFloat(String(r[3]).replace(/[,₱\s]/g, ""));

    if (!supplierName || !invoiceNumber || !isFinite(amount) || amount <= 0) {
      skipped++;
      continue;
    }

    parsed.push({ date: iso, supplierName, invoiceNumber, amount, srcRow: i + 1 });
  }

  console.log(`Parsed: ${parsed.length} invoices, skipped: ${skipped}`);
  console.log(`Date range: ${parsed[0]?.date} → ${parsed[parsed.length - 1]?.date}`);

  // Unique supplier names
  const uniqueSuppliers = [...new Set(parsed.map(r => r.supplierName))];
  console.log(`Unique suppliers: ${uniqueSuppliers.length}`);

  // Load existing suppliers
  const existingSuppliers = (await db.execute(sql`
    SELECT id, name FROM suppliers WHERE org_id = ${ORG_ID}
  `)) as any[];
  const supplierMap = new Map<string, string>(); // lowercase name → id
  for (const s of existingSuppliers) {
    supplierMap.set(s.name.toLowerCase(), s.id);
  }
  console.log(`Existing suppliers in DB: ${existingSuppliers.length}`);

  // Find missing suppliers
  const missingSups: string[] = [];
  for (const name of uniqueSuppliers) {
    if (!supplierMap.has(name.toLowerCase())) {
      missingSups.push(name);
    }
  }
  console.log(`Suppliers to create: ${missingSups.length}`);
  if (missingSups.length > 0) {
    console.log("  New suppliers:", missingSups.slice(0, 20).join(", "), missingSups.length > 20 ? `... +${missingSups.length - 20} more` : "");
  }

  // Check for duplicate invoice numbers already in DB
  const allInvNums = parsed.map(r => r.invoiceNumber);
  const existingInvs = (await db.execute(sql`
    SELECT si.invoice_number, s.name AS supplier_name
    FROM supplier_invoices si
    JOIN suppliers s ON s.id = si.supplier_id
    WHERE si.org_id = ${ORG_ID}
  `)) as any[];
  const existingInvSet = new Set(existingInvs.map((r: any) => `${r.supplier_name.toLowerCase()}|${r.invoice_number}`));

  let dupCount = 0;
  const toInsert: InvoiceRow[] = [];
  for (const row of parsed) {
    const key = `${row.supplierName.toLowerCase()}|${row.invoiceNumber}`;
    if (existingInvSet.has(key)) {
      dupCount++;
    } else {
      toInsert.push(row);
      existingInvSet.add(key); // prevent intra-file dupes
    }
  }
  console.log(`Duplicates (already in DB): ${dupCount}`);
  console.log(`Invoices to insert: ${toInsert.length}`);

  // Total amount
  const totalAmount = toInsert.reduce((s, r) => s + r.amount, 0);
  console.log(`Total amount: ₱${totalAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  // Admin user
  const [admin] = (await db.execute(sql`SELECT id FROM users WHERE email = 'admin@apex.com' LIMIT 1`)) as any[];
  if (!admin) { console.error("ABORT: admin not found"); process.exit(1); }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  // === APPLY ===
  console.log("\nCreating missing suppliers...");
  for (const name of missingSups) {
    const [created] = (await db.execute(sql`
      INSERT INTO suppliers (org_id, name)
      VALUES (${ORG_ID}, ${name})
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `)) as any[];
    if (created) {
      supplierMap.set(created.name.toLowerCase(), created.id);
    } else {
      // May have been created by a concurrent process; re-fetch
      const [existing] = (await db.execute(sql`
        SELECT id FROM suppliers WHERE org_id = ${ORG_ID} AND LOWER(name) = LOWER(${name}) LIMIT 1
      `)) as any[];
      if (existing) supplierMap.set(name.toLowerCase(), existing.id);
    }
  }
  console.log(`Suppliers ready: ${supplierMap.size}`);

  // Batch insert invoices
  const BATCH = 200;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    try {
      await db.transaction(async (tx) => {
        for (const row of batch) {
          const supplierId = supplierMap.get(row.supplierName.toLowerCase());
          if (!supplierId) {
            console.error(`  SKIP row ${row.srcRow}: supplier not found: ${row.supplierName}`);
            errors++;
            continue;
          }

          const dueDate = addDays(row.date, 30);
          await tx.execute(sql`
            INSERT INTO supplier_invoices (
              org_id, supplier_id, invoice_number, invoice_date, due_date,
              total_amount, paid_amount, balance, status, payment_terms_days,
              currency, recorded_by
            ) VALUES (
              ${ORG_ID}, ${supplierId}, ${row.invoiceNumber}, ${row.date}::date, ${dueDate}::date,
              ${row.amount.toFixed(2)}, '0.00', ${row.amount.toFixed(2)}, 'OPEN', 30,
              'PHP', ${admin.id}
            )
            ON CONFLICT (org_id, supplier_id, invoice_number) DO NOTHING
          `);
          inserted++;
        }
      });
    } catch (err: any) {
      console.error(`  Batch error at row ${i}: ${err.message}`);
      errors += batch.length;
    }
    if ((i + BATCH) % 500 === 0 || i + BATCH >= toInsert.length) {
      console.log(`  Progress: ${Math.min(i + BATCH, toInsert.length)}/${toInsert.length}`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);
  console.log(`Duplicates skipped: ${dupCount}`);

  // Verify
  const [count] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM supplier_invoices WHERE org_id = ${ORG_ID}
  `)) as any[];
  console.log(`Total invoices in DB: ${count.n}`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
