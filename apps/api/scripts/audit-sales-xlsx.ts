/**
 * Audit the SALES CBROS Excel file before building the schema + importer.
 * Reports: sheet names, header row, row counts, column value stats,
 * null-row detection, date range, and a few sample rows.
 *
 * Run:
 *   npx tsx apps/api/scripts/audit-sales-xlsx.ts
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const XLSX_PATH = "C:/Users/Admin/Downloads/SALES CBROS - 11-21-20_UI.xlsx";

function excelSerialToISO(n: number): string | null {
  // Excel serial date: days since 1899-12-30 (accounting for 1900 leap bug)
  if (typeof n !== "number" || isNaN(n)) return null;
  const ms = (n - 25569) * 86400 * 1000; // 25569 = days between 1899-12-30 and 1970-01-01
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function main() {
  console.log(`=== Auditing ${path.basename(XLSX_PATH)} ===\n`);

  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`ABORT: file not found at ${XLSX_PATH}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });

  console.log(`Sheet names (${wb.SheetNames.length}):`);
  for (const name of wb.SheetNames) console.log(`  - ${name}`);
  console.log("");

  // Pick "Sheet1" as specified; fall back to the first sheet.
  const targetName = wb.SheetNames.includes("Sheet1") ? "Sheet1" : wb.SheetNames[0];
  console.log(`Auditing sheet: "${targetName}"\n`);

  const ws = wb.Sheets[targetName];
  if (!ws["!ref"]) {
    console.error("ABORT: target sheet has no cells");
    process.exit(1);
  }

  const range = XLSX.utils.decode_range(ws["!ref"]);
  console.log(`Range: ${ws["!ref"]}  (${range.e.r - range.s.r + 1} rows, ${range.e.c - range.s.c + 1} cols)\n`);

  // Raw sheet_to_json with header: 1 gives arrays so we can see the exact header row.
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  console.log(`Total rows (incl. header): ${aoa.length}`);

  // Show first 3 rows verbatim
  console.log("\nFirst 3 raw rows:");
  for (let i = 0; i < Math.min(3, aoa.length); i++) {
    console.log(`  row ${i}:`, aoa[i]);
  }

  // Treat row 0 as header; map subsequent rows
  const header = (aoa[0] || []).map((h: any) => (h == null ? "" : String(h).trim()));
  console.log("\nHeader row (normalized):");
  header.forEach((h: string, i: number) => console.log(`  [${i}] "${h}"`));

  const dataRows = aoa.slice(1);
  console.log(`\nData rows (excluding header): ${dataRows.length}`);

  // Identify which columns hold numeric values. We look at every column and
  // count how many of the data rows have a non-null / non-blank value.
  console.log("\nPer-column non-null count and type distribution:");
  const colStats: Array<{
    idx: number;
    name: string;
    nonNull: number;
    numCount: number;
    strCount: number;
    boolCount: number;
    minNum: number | null;
    maxNum: number | null;
  }> = [];

  for (let c = 0; c < header.length; c++) {
    let nonNull = 0;
    let numCount = 0;
    let strCount = 0;
    let boolCount = 0;
    let minNum: number | null = null;
    let maxNum: number | null = null;
    for (const row of dataRows) {
      const v = row[c];
      if (v == null || v === "") continue;
      nonNull++;
      if (typeof v === "number") {
        numCount++;
        if (minNum === null || v < minNum) minNum = v;
        if (maxNum === null || v > maxNum) maxNum = v;
      } else if (typeof v === "boolean") {
        boolCount++;
      } else {
        strCount++;
      }
    }
    colStats.push({ idx: c, name: header[c], nonNull, numCount, strCount, boolCount, minNum, maxNum });
  }
  console.table(colStats);

  // Date column stats — first column should be the date
  const dateIdx = 0;
  const dates = dataRows
    .map((r) => r[dateIdx])
    .filter((v) => v != null && v !== "");
  console.log(`\nDate column [${dateIdx}] "${header[dateIdx]}"  — ${dates.length} non-null values`);

  const numericDates = dates.filter((v) => typeof v === "number") as number[];
  const stringDates = dates.filter((v) => typeof v === "string") as string[];
  console.log(`  numeric serials: ${numericDates.length}`);
  console.log(`  string dates:    ${stringDates.length}`);
  if (numericDates.length > 0) {
    const minSerial = Math.min(...numericDates);
    const maxSerial = Math.max(...numericDates);
    console.log(`  range: ${excelSerialToISO(minSerial)} (${minSerial}) \u2192 ${excelSerialToISO(maxSerial)} (${maxSerial})`);
  }

  // Count rows where the date is valid AND at least one value column is non-null
  // Value columns = everything except date [0] and DAY [1] (the day-of-week derived column)
  const valueColIndices: number[] = [];
  for (let c = 2; c < header.length; c++) {
    // Include columns that have at least one numeric value
    if (colStats[c].numCount > 0) valueColIndices.push(c);
  }
  console.log(`\nValue columns (numeric, excl. date + day): indices ${valueColIndices.join(", ")}`);
  console.log(`  mapped names: ${valueColIndices.map((i) => header[i]).join(", ")}`);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  let rowsWithDate = 0;
  let rowsFutureDate = 0;
  let rowsAllNullValues = 0;
  let rowsImportable = 0;
  let rowsPartialData = 0;

  for (const r of dataRows) {
    const dateVal = r[dateIdx];
    if (dateVal == null || dateVal === "") continue;
    rowsWithDate++;

    let iso: string | null = null;
    if (typeof dateVal === "number") iso = excelSerialToISO(dateVal);
    else if (typeof dateVal === "string") iso = dateVal.slice(0, 10);
    if (!iso) continue;

    const isFuture = iso > todayIso;
    if (isFuture) rowsFutureDate++;

    const valuesPresent = valueColIndices
      .map((i) => r[i])
      .filter((v) => v != null && v !== "" && typeof v === "number" && v !== 0);

    if (valuesPresent.length === 0) {
      rowsAllNullValues++;
      continue;
    }

    if (!isFuture) {
      rowsImportable++;
      if (valuesPresent.length < valueColIndices.length) rowsPartialData++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Rows with date:                ${rowsWithDate}`);
  console.log(`Rows with future date:         ${rowsFutureDate}`);
  console.log(`Rows with all value cols null: ${rowsAllNullValues}`);
  console.log(`Rows importable (date<=today, \u22651 value): ${rowsImportable}`);
  console.log(`  of which partial (some cols null): ${rowsPartialData}`);

  // Sample the last few importable rows to see what the import will look like
  console.log("\n=== Last 5 importable rows (raw sample) ===");
  const sample: any[] = [];
  for (let i = dataRows.length - 1; i >= 0 && sample.length < 5; i--) {
    const r = dataRows[i];
    const dateVal = r[dateIdx];
    if (dateVal == null) continue;
    const iso =
      typeof dateVal === "number" ? excelSerialToISO(dateVal) :
      typeof dateVal === "string" ? dateVal.slice(0, 10) : null;
    if (!iso || iso > todayIso) continue;
    const hasValue = valueColIndices.some((ci) => {
      const v = r[ci];
      return typeof v === "number" && v !== 0;
    });
    if (!hasValue) continue;
    const obj: any = { date: iso };
    for (const ci of valueColIndices) obj[header[ci]] = r[ci] ?? null;
    sample.push(obj);
  }
  console.table(sample);

  // Look for the specific Mar 1, 2026 partial row the user mentioned (JUNIOR=29717)
  const mar1 = dataRows.find((r) => {
    const v = r[dateIdx];
    if (typeof v !== "number") return false;
    return excelSerialToISO(v) === "2026-03-01";
  });
  if (mar1) {
    console.log("\nMar 1, 2026 row (user-mentioned edge case):");
    const obj: any = { date: "2026-03-01" };
    for (let c = 0; c < header.length; c++) obj[header[c]] = mar1[c] ?? null;
    console.log(obj);
  }

  process.exit(0);
}

main();
