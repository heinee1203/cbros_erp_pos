/**
 * One-time import of the legacy SALES_CBROS Excel workbook into the
 * daily_sales_summary analytics table.
 *
 * Source: "SALES CBROS - 11-21-20_UI.xlsx" — 14 columns, one row per day
 * from 2019-06-01 onward. Only the "Sheet1" tab is imported; the DAILY /
 * MONTHLY / ANNUAL tabs are formula-driven report templates.
 *
 * Behavior:
 *   - DRY RUN by default. --apply to write.
 *   - Skips rows where the date is in the future OR all value columns are
 *     null / zero.
 *   - Converts all amounts to CENTAVOS (multiply by 100, round to int).
 *     Handles the few rows with decimal peso values (e.g. SERVICE
 *     "363,878.7") without loss.
 *   - Handles the few non-numeric stray values found in A/P ON ACCT and
 *     JUNIOR (audit found 1 string in each) by treating them as 0.
 *   - UPSERT on (org_id, date) — re-running the import updates existing
 *     rows rather than creating duplicates. This also lets us re-run after
 *     fixing the source Excel file.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/import-daily-sales.ts
 *   Apply:    npx tsx apps/api/scripts/import-daily-sales.ts --apply
 *   Custom file: npx tsx apps/api/scripts/import-daily-sales.ts --file="path/to/file.xlsx"
 */
import fs from "fs";
import path from "path";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import * as XLSX from "xlsx";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";

// ── Args ──
const APPLY = process.argv.includes("--apply");
const FILE_ARG = process.argv.find((a) => a.startsWith("--file="));
const XLSX_PATH = FILE_ARG
  ? FILE_ARG.split("=")[1].replace(/^["']|["']$/g, "")
  : "C:/Users/Admin/Downloads/SALES CBROS - 11-21-20_UI.xlsx";

// ── Target org ──
// Single-tenant deployment — C-Bros GENUINE AUTOPARTS. Verified via
// earlier scripts (see lookup-lucky-se7en-ar-number.ts etc.)
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

// ── Column mapping ──
// Excel header → DB column. Order matters — this is how we read the
// aoa-style rows. Columns not in this map (DAY, TOTAL - A/P) are ignored.
interface ColMap {
  header: string;
  dbCol: string;
  xlsxIdx: number;
}
const COL_ORDER = [
  "DATE",         // 0  — handled separately
  "DAY",          // 1  — ignored (derived from date if needed)
  "A/P - OLD",    // 2
  "A/P - NEW",    // 3
  "TOTAL - A/P",  // 4  — ignored (computed from old + new)
  "A/P ON ACCT",  // 5
  "A/C",          // 6
  "A/C ON ACCT",  // 7
  "SERVICE",      // 8
  "S - ON ACCT",  // 9
  "PAINTING",     // 10
  "P- ON ACCT",   // 11
  "JUNIOR",       // 12
  "PAYMENT",      // 13
];

const VALUE_COLS: ColMap[] = [
  { header: "A/P - OLD",    dbCol: "ap_old_sales",        xlsxIdx: 2 },
  { header: "A/P - NEW",    dbCol: "ap_new_sales",        xlsxIdx: 3 },
  { header: "A/P ON ACCT",  dbCol: "ap_on_account",       xlsxIdx: 5 },
  { header: "A/C",          dbCol: "ac_sales",            xlsxIdx: 6 },
  { header: "A/C ON ACCT",  dbCol: "ac_on_account",       xlsxIdx: 7 },
  { header: "SERVICE",      dbCol: "service_sales",       xlsxIdx: 8 },
  { header: "S - ON ACCT",  dbCol: "service_on_account",  xlsxIdx: 9 },
  { header: "PAINTING",     dbCol: "painting_sales",      xlsxIdx: 10 },
  { header: "P- ON ACCT",   dbCol: "painting_on_account", xlsxIdx: 11 },
  { header: "JUNIOR",       dbCol: "junior_sales",        xlsxIdx: 12 },
  { header: "PAYMENT",      dbCol: "payments",            xlsxIdx: 13 },
];

// ── Helpers ──

function excelSerialToISO(n: number): string | null {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Convert a raw cell value to integer CENTAVOS.
 * - null / undefined / "" / non-numeric strings → 0
 * - numbers → round(value * 100)
 * Round is essential because IEEE-754 sometimes produces e.g. 36387870.0000001
 * on the multiplication of "363878.7 * 100".
 */
function toCentavos(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") {
    if (!isFinite(v)) return 0;
    return Math.round(v * 100);
  }
  if (typeof v === "string") {
    const cleaned = v.replace(/[,₱\s]/g, "").trim();
    if (!cleaned) return 0;
    const n = parseFloat(cleaned);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  }
  return 0;
}

function fmtPeso(centavos: number): string {
  return (centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Main ──

interface ParsedRow {
  date: string;
  dbValues: Record<string, number>;
  /** Original row index in the sheet (1-based, incl. header) for debugging */
  srcRow: number;
}

async function main() {
  console.log(`=== Import daily sales (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);
  console.log(`source file: ${XLSX_PATH}`);

  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`ABORT: source file not found`);
    process.exit(1);
  }

  // ── Guard: org exists ──
  const [org] = (await db.execute(sql`
    SELECT id, name FROM organizations WHERE id = ${ORG_ID}
  `)) as any[];
  if (!org) {
    console.error(`ABORT: organization ${ORG_ID} not found`);
    process.exit(1);
  }
  console.log(`target org: ${org.name}  (${org.id})\n`);

  // ── Load & parse sheet ──
  const buf = fs.readFileSync(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const targetName = wb.SheetNames.includes("Sheet1") ? "Sheet1" : wb.SheetNames[0];
  console.log(`parsing sheet: "${targetName}"`);
  const ws = wb.Sheets[targetName];
  if (!ws["!ref"]) {
    console.error("ABORT: sheet has no cells");
    process.exit(1);
  }

  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  // Validate header row matches expected layout so we never silently
  // import the wrong columns if the source file is reorganized.
  const header = (aoa[0] || []).map((h: any) => (h == null ? "" : String(h).trim()));
  const mismatches: string[] = [];
  for (let i = 0; i < COL_ORDER.length; i++) {
    if (header[i] !== COL_ORDER[i]) {
      mismatches.push(`  [${i}] expected="${COL_ORDER[i]}" got="${header[i]}"`);
    }
  }
  if (mismatches.length > 0) {
    console.error("ABORT: header row does not match expected layout:");
    mismatches.forEach((m) => console.error(m));
    process.exit(1);
  }
  console.log(`header validated — ${header.length} columns\n`);

  // ── Parse data rows ──
  const today = new Date().toISOString().slice(0, 10);
  const parsed: ParsedRow[] = [];
  let skippedNoDate = 0;
  let skippedFuture = 0;
  let skippedAllZero = 0;
  let skippedNonNumericDate = 0;
  let rowsWithCoercedCell = 0;

  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.length === 0) continue;

    const dateCell = r[0];
    if (dateCell == null || dateCell === "") {
      skippedNoDate++;
      continue;
    }

    let iso: string | null = null;
    if (typeof dateCell === "number") {
      iso = excelSerialToISO(dateCell);
    } else if (typeof dateCell === "string") {
      // e.g. "2019-06-01" or "6/1/2019" — normalize to YYYY-MM-DD
      const d = new Date(dateCell);
      if (!isNaN(d.getTime())) iso = d.toISOString().slice(0, 10);
    }
    if (!iso) {
      skippedNonNumericDate++;
      continue;
    }

    // Skip future dates (pre-filled but empty in the workbook)
    if (iso > today) {
      skippedFuture++;
      continue;
    }

    // Build centavos row
    const dbValues: Record<string, number> = {};
    let anyNonZero = false;
    let rowHadCoercion = false;
    for (const c of VALUE_COLS) {
      const raw = r[c.xlsxIdx];
      // Track non-numeric but non-null coercions as a data quality note
      if (
        raw != null &&
        raw !== "" &&
        typeof raw !== "number" &&
        typeof raw !== "boolean"
      ) {
        rowHadCoercion = true;
      }
      const cents = toCentavos(raw);
      dbValues[c.dbCol] = cents;
      if (cents !== 0) anyNonZero = true;
    }

    // User explicitly said: include 2026-03-01 even though it only has
    // JUNIOR=29717 (partial day). The `anyNonZero` check satisfies that.
    if (!anyNonZero) {
      skippedAllZero++;
      continue;
    }

    if (rowHadCoercion) rowsWithCoercedCell++;
    parsed.push({ date: iso, dbValues, srcRow: i + 1 });
  }

  // Sort chronologically for sanity
  parsed.sort((a, b) => a.date.localeCompare(b.date));

  console.log("=== Parse summary ===");
  console.log(`Total data rows in sheet:       ${aoa.length - 1}`);
  console.log(`Parsed (importable):            ${parsed.length}`);
  console.log(`Skipped — no date:              ${skippedNoDate}`);
  console.log(`Skipped — unparseable date:     ${skippedNonNumericDate}`);
  console.log(`Skipped — future date:          ${skippedFuture}`);
  console.log(`Skipped — all value cols zero:  ${skippedAllZero}`);
  console.log(`Rows with coerced non-number:   ${rowsWithCoercedCell}`);
  if (parsed.length > 0) {
    console.log(`Earliest date: ${parsed[0].date}`);
    console.log(`Latest date:   ${parsed[parsed.length - 1].date}`);
  }

  // Sum each column for a sanity check (pesos)
  const columnSums: Record<string, number> = {};
  for (const c of VALUE_COLS) columnSums[c.header] = 0;
  for (const row of parsed) {
    for (const c of VALUE_COLS) columnSums[c.header] += row.dbValues[c.dbCol];
  }
  console.log("\nColumn sums across all parsed rows (peso):");
  console.table(
    VALUE_COLS.map((c) => ({
      header: c.header,
      dbCol: c.dbCol,
      total: fmtPeso(columnSums[c.header]),
    })),
  );

  // Sample a few rows so we can visually confirm the centavos conversion
  console.log("\nSample parsed rows:");
  const samples = [
    parsed[0],
    parsed[Math.floor(parsed.length / 4)],
    parsed[Math.floor(parsed.length / 2)],
    parsed[Math.floor((3 * parsed.length) / 4)],
    parsed[parsed.length - 1],
  ].filter(Boolean);
  console.table(
    samples.map((p) => ({
      date: p.date,
      ap_old: fmtPeso(p.dbValues.ap_old_sales),
      ap_new: fmtPeso(p.dbValues.ap_new_sales),
      ap_acct: fmtPeso(p.dbValues.ap_on_account),
      ac: fmtPeso(p.dbValues.ac_sales),
      service: fmtPeso(p.dbValues.service_sales),
      painting: fmtPeso(p.dbValues.painting_sales),
      junior: fmtPeso(p.dbValues.junior_sales),
      payments: fmtPeso(p.dbValues.payments),
    })),
  );

  // Check for duplicate dates in the parsed set (shouldn't happen, but
  // the Excel could theoretically have the same date on two rows)
  const dateCounts = new Map<string, number>();
  for (const p of parsed) dateCounts.set(p.date, (dateCounts.get(p.date) ?? 0) + 1);
  const dupes = [...dateCounts.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    console.log(`\n⚠  Duplicate dates in source: ${dupes.length}`);
    console.table(dupes.slice(0, 10).map(([date, n]) => ({ date, count: n })));
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  // ── Apply — upsert in a single transaction ──
  console.log(`\nUpserting ${parsed.length} rows into daily_sales_summary...`);

  const BATCH = 250;
  let upserted = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.length; i += BATCH) {
      const chunk = parsed.slice(i, i + BATCH);

      // Build a multi-row INSERT ... ON CONFLICT UPDATE using sql.join
      const valuesSql = sql.join(
        chunk.map(
          (p) => sql`(
            ${ORG_ID}::uuid,
            ${p.date}::date,
            ${p.dbValues.ap_old_sales},
            ${p.dbValues.ap_new_sales},
            ${p.dbValues.ap_on_account},
            ${p.dbValues.ac_sales},
            ${p.dbValues.ac_on_account},
            ${p.dbValues.service_sales},
            ${p.dbValues.service_on_account},
            ${p.dbValues.painting_sales},
            ${p.dbValues.painting_on_account},
            ${p.dbValues.junior_sales},
            ${p.dbValues.payments},
            'IMPORT'
          )`,
        ),
        sql`, `,
      );

      await tx.execute(sql`
        INSERT INTO daily_sales_summary (
          org_id, date,
          ap_old_sales, ap_new_sales, ap_on_account,
          ac_sales, ac_on_account,
          service_sales, service_on_account,
          painting_sales, painting_on_account,
          junior_sales,
          payments,
          source
        ) VALUES ${valuesSql}
        ON CONFLICT (org_id, date) DO UPDATE SET
          ap_old_sales        = EXCLUDED.ap_old_sales,
          ap_new_sales        = EXCLUDED.ap_new_sales,
          ap_on_account       = EXCLUDED.ap_on_account,
          ac_sales            = EXCLUDED.ac_sales,
          ac_on_account       = EXCLUDED.ac_on_account,
          service_sales       = EXCLUDED.service_sales,
          service_on_account  = EXCLUDED.service_on_account,
          painting_sales      = EXCLUDED.painting_sales,
          painting_on_account = EXCLUDED.painting_on_account,
          junior_sales        = EXCLUDED.junior_sales,
          payments            = EXCLUDED.payments,
          source              = EXCLUDED.source,
          updated_at          = NOW()
      `);
      upserted += chunk.length;
    }
  });

  console.log(`upserted ${upserted} rows\n`);

  // ── Post-apply verification ──
  const [{ row_count, min_date, max_date }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS row_count,
           MIN(date)::text AS min_date,
           MAX(date)::text AS max_date
    FROM daily_sales_summary
    WHERE org_id = ${ORG_ID}
  `)) as any[];

  console.log("=== Post-apply state ===");
  console.log(`row_count: ${row_count}`);
  console.log(`date range: ${min_date} \u2192 ${max_date}`);

  // Reconcile column sums DB vs parsed (should match exactly)
  const [dbSums] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(ap_old_sales), 0)::bigint        AS ap_old_sales,
      COALESCE(SUM(ap_new_sales), 0)::bigint        AS ap_new_sales,
      COALESCE(SUM(ap_on_account), 0)::bigint       AS ap_on_account,
      COALESCE(SUM(ac_sales), 0)::bigint            AS ac_sales,
      COALESCE(SUM(ac_on_account), 0)::bigint       AS ac_on_account,
      COALESCE(SUM(service_sales), 0)::bigint       AS service_sales,
      COALESCE(SUM(service_on_account), 0)::bigint  AS service_on_account,
      COALESCE(SUM(painting_sales), 0)::bigint      AS painting_sales,
      COALESCE(SUM(painting_on_account), 0)::bigint AS painting_on_account,
      COALESCE(SUM(junior_sales), 0)::bigint        AS junior_sales,
      COALESCE(SUM(payments), 0)::bigint            AS payments
    FROM daily_sales_summary
    WHERE org_id = ${ORG_ID}
  `)) as any[];

  console.log("\nDB column sums (peso) — should match the parse-summary sums:");
  console.table(
    VALUE_COLS.map((c) => ({
      header: c.header,
      dbCol: c.dbCol,
      parsed: fmtPeso(columnSums[c.header]),
      db: fmtPeso(Number(dbSums[c.dbCol])),
      match: Number(dbSums[c.dbCol]) === columnSums[c.header] ? "\u2713" : "\u2717",
    })),
  );

  const allMatch = VALUE_COLS.every(
    (c) => Number(dbSums[c.dbCol]) === columnSums[c.header],
  );
  if (!allMatch) {
    console.error("\n\u2717 ERROR: DB sums don't match parsed sums — investigate");
    process.exit(1);
  }
  console.log("\n\u2713 All column sums reconcile.");

  // Year-over-year row counts as a final sanity check
  const perYear = (await db.execute(sql`
    SELECT EXTRACT(YEAR FROM date)::int AS year,
           COUNT(*)::int                AS days,
           (SUM(ap_old_sales + ap_new_sales + ap_on_account
                + ac_sales + ac_on_account
                + service_sales + service_on_account
                + painting_sales + painting_on_account
                + junior_sales)::bigint) AS total_sales_centavos
    FROM daily_sales_summary
    WHERE org_id = ${ORG_ID}
    GROUP BY EXTRACT(YEAR FROM date)
    ORDER BY year
  `)) as any[];
  console.log("\nRow count + total sales by year:");
  console.table(
    perYear.map((r: any) => ({
      year: r.year,
      days: r.days,
      total_sales: fmtPeso(Number(r.total_sales_centavos)),
    })),
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
