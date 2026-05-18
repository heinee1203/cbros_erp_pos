import { findColumn } from "./csv-utils";

export interface LoyverseColumnIndex {
  name: number;
  sku: number;
  price: number;
  cost: number;
  barcode: number;
  category: number;
  subcategory: number;
  brand: number;
  family: number;
  description: number;
  handle: number;
  supplier: number;
  active: number;
  unit: number;
  trackSerial: number;
  trackDot: number;
  specialOrder: number;
  oemNumber: number;
  option1Name: number;
  option1Value: number;
  option2Name: number;
  option2Value: number;
  option3Name: number;
  option3Value: number;
}

export interface ParsedLoyverseLocation {
  csvLocationName: string;
  apexLocationId: string | null;
  stockLevel: number;
  stockLevelWasPresent: boolean;
  available: boolean;
  reorderPoint: number;
  optimalStock: number;
}

export function buildLoyverseColumnIndex(headers: string[]): LoyverseColumnIndex {
  return {
    name: findColumn(headers, "name"),
    sku: findColumn(headers, "sku"),
    price: findColumn(headers, "price"),
    cost: findColumn(headers, "cost"),
    barcode: findColumn(headers, "barcode"),
    category: findColumn(headers, "category"),
    subcategory: findColumn(headers, "subcategory"),
    brand: findColumn(headers, "brand"),
    family: findColumn(headers, "family"),
    description: findColumn(headers, "description"),
    handle: findColumn(headers, "handle"),
    supplier: findColumn(headers, "supplier"),
    active: findColumn(headers, "active"),
    unit: findColumn(headers, "unit"),
    trackSerial: findColumn(headers, "trackSerial"),
    trackDot: findColumn(headers, "trackDot"),
    specialOrder: findColumn(headers, "specialOrder"),
    oemNumber: findColumn(headers, "oemNumber"),
    option1Name: findColumn(headers, "option1Name"),
    option1Value: findColumn(headers, "option1Value"),
    option2Name: findColumn(headers, "option2Name"),
    option2Value: findColumn(headers, "option2Value"),
    option3Name: findColumn(headers, "option3Name"),
    option3Value: findColumn(headers, "option3Value"),
  };
}

export function buildHeaderIndex(headers: string[]): Record<string, number> {
  const headerIdx: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    headerIdx[headers[i].toLowerCase()] = i;
  }
  return headerIdx;
}

export function extractCsvLocationNames(headers: string[]): Set<string> {
  const patterns = [
    /^in stock \[(.+)\]$/i,
    /^available for sale \[(.+)\]$/i,
    /^price \[(.+)\]$/i,
    /^low stock \[(.+)\]$/i,
    /^optimal stock \[(.+)\]$/i,
  ];
  const csvLocationNames = new Set<string>();

  for (const header of headers) {
    for (const pattern of patterns) {
      const match = header.match(pattern);
      if (match) csvLocationNames.add(match[1].trim());
    }
  }

  return csvLocationNames;
}

export function getCellByIndex(row: string[], idx: number): string {
  if (idx < 0) return "";
  return (row[idx] ?? "").trim();
}

export function isExcelDamagedSku(value: string): boolean {
  return /[eE]\+/.test(value);
}

export function isExcelDamagedBarcode(value: string): boolean {
  return /[eE]/.test(value);
}

export function parseBrandNameFromCategory(categoryName: string): string {
  return categoryName && categoryName.includes(" - ")
    ? categoryName.split(" - ").slice(1).join(" - ").trim()
    : "";
}

export interface ParsedImportPrices {
  isVariablePrice: boolean;
  costPrice: number;
  unitPrice: number;
  errors: string[];
}

export function parseImportPrices(costStr: string, priceStr: string): ParsedImportPrices {
  const priceNorm = (priceStr ?? "").trim().toLowerCase();
  const costNorm = (costStr ?? "").trim().toLowerCase();
  const isVariablePrice = priceNorm === "variable";
  const costPrice =
    costNorm && costNorm !== "variable" && costNorm !== "n/a"
      ? parseFloat(costStr.replace(/[^0-9.-]/g, ""))
      : 0;
  const unitPrice = isVariablePrice
    ? 0
    : priceNorm && priceNorm !== "n/a"
      ? parseFloat(priceStr.replace(/[^0-9.-]/g, ""))
      : 0;
  const errors: string[] = [];

  if (costStr && costNorm !== "variable" && costNorm !== "n/a" && isNaN(costPrice)) {
    errors.push("Invalid cost price");
  }
  if (priceStr && !isVariablePrice && priceNorm !== "n/a" && priceNorm !== "" && isNaN(unitPrice)) {
    errors.push("Invalid unit price");
  }

  return { isVariablePrice, costPrice, unitPrice, errors };
}

export function parseLoyverseRowLocation(
  mapping: { csvName: string; apexLocationId: string | null },
  headerIdx: Record<string, number>,
  row: string[],
): ParsedLoyverseLocation {
  const stockIdx = headerIdx[`in stock [${mapping.csvName}]`.toLowerCase()];
  const availIdx = headerIdx[`available for sale [${mapping.csvName}]`.toLowerCase()];
  const lowStockIdx = headerIdx[`low stock [${mapping.csvName}]`.toLowerCase()];
  const optimalStockIdx = headerIdx[`optimal stock [${mapping.csvName}]`.toLowerCase()];

  const rawStock = stockIdx !== undefined ? (row[stockIdx] ?? "").trim() : "";
  const stockLevelWasPresent = rawStock !== "";
  const stockLevel = stockLevelWasPresent ? parseInt(rawStock, 10) || 0 : 0;
  const availRaw = availIdx !== undefined ? (row[availIdx] ?? "").trim().toLowerCase() : "";
  const available =
    availRaw === "" || availRaw === "y" || availRaw === "yes" || availRaw === "true" || availRaw === "1";
  const rawLowStock = lowStockIdx !== undefined ? (row[lowStockIdx] ?? "").trim() : "";
  const reorderPoint = rawLowStock !== "" ? Math.max(0, parseInt(rawLowStock, 10) || 0) : 0;
  const rawOptimal = optimalStockIdx !== undefined ? (row[optimalStockIdx] ?? "").trim() : "";
  const optimalStock = rawOptimal !== "" ? Math.max(0, parseInt(rawOptimal, 10) || 0) : 0;

  return {
    csvLocationName: mapping.csvName,
    apexLocationId: mapping.apexLocationId,
    stockLevel,
    stockLevelWasPresent,
    available,
    reorderPoint,
    optimalStock,
  };
}
