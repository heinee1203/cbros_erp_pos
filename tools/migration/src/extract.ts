import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { DATA_DIR } from "./config";

// ── Phase 1: Extract ──
// Parses CSV and Excel files from the data/ directory into uniform row arrays.

export interface RawRow {
  [key: string]: string;
}

/**
 * Read a CSV or Excel file and return an array of header-keyed row objects.
 * All values are strings (even numbers) for maximum safety during staging.
 */
export function extractFile(filename: string): RawRow[] {
  const filePath = path.resolve(DATA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Source file not found: ${filePath}`);
  }

  const ext = path.extname(filename).toLowerCase();

  if (ext === ".csv" || ext === ".tsv") {
    return extractCSV(filePath, ext === ".tsv" ? "\t" : ",");
  }

  if (ext === ".xlsx" || ext === ".xls") {
    return extractExcel(filePath);
  }

  throw new Error(`Unsupported file format: ${ext}. Use .csv, .tsv, .xlsx, or .xls`);
}

function extractCSV(filePath: string, delimiter: string): RawRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
    cast: false, // Keep everything as string
  });

  console.log(`  Extracted ${records.length} rows from CSV: ${path.basename(filePath)}`);
  return normalizeHeaders(records);
}

function extractExcel(filePath: string): RawRow[] {
  const workbook = XLSX.readFile(filePath, { type: "file" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");

  const sheet = workbook.Sheets[sheetName];
  const records: RawRow[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false, // Force string output
  });

  console.log(`  Extracted ${records.length} rows from Excel sheet "${sheetName}": ${path.basename(filePath)}`);
  return normalizeHeaders(records);
}

/**
 * Normalize header names to snake_case for consistent field mapping.
 * "Product Name" → "product_name", "SKU" → "sku", etc.
 */
function normalizeHeaders(rows: RawRow[]): RawRow[] {
  if (rows.length === 0) return rows;

  return rows.map((row) => {
    const normalized: RawRow = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      normalized[normalizedKey] = typeof value === "string" ? value.trim() : String(value ?? "");
    }
    return normalized;
  });
}

/**
 * List available data files in the data/ directory.
 */
export function listDataFiles(): string[] {
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`  Data directory does not exist: ${DATA_DIR}`);
    return [];
  }
  return fs.readdirSync(DATA_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".csv", ".tsv", ".xlsx", ".xls"].includes(ext);
  });
}
