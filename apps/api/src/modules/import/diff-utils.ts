/** Parse Y/N/Yes/No/true/false to boolean, null if empty or unrecognized. */
export function parseYN(value: string | undefined | null): boolean | null {
  if (!value?.trim()) return null;
  const v = value.trim().toUpperCase();
  if (v === "Y" || v === "YES" || v === "TRUE" || v === "1") return true;
  if (v === "N" || v === "NO" || v === "FALSE" || v === "0") return false;
  return null;
}

/** Strip zero-width Unicode artifacts (BOM, LTR/RTL marks, soft hyphens). */
export function sanitizeText(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, "").trim();
}

export function parseMoney2dp(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const s = typeof value === "number" ? String(value) : value.trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  if (isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export interface ImportDiffLocation {
  csvLocationName: string;
  apexLocationId: string | null;
  stockLevel: number;
  stockLevelWasPresent: boolean;
}

export interface ExistingForDiff {
  name: string | null;
  unitPrice: string | null;
  costPrice: string | null;
  barcode: string | null;
  categoryName: string | null;
}

export interface CsvForDiff {
  name: string;
  unitPrice: string;
  costPrice: string;
  barcode: string;
  categoryName: string;
  isVariant: boolean;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  locations: ImportDiffLocation[];
}

const CHANGE_ARROW = "\u2192";

/** Returns a list of human-readable change strings. Empty list means NO_CHANGE. */
export function computeItemDiff(
  existing: ExistingForDiff,
  csv: CsvForDiff,
  existingStockByLocation: Map<string, number>,
  existingVariantOptions: Array<{ typeName: string; value: string }>,
): string[] {
  const changes: string[] = [];

  const csvName = normalizeText(csv.name);
  const dbName = normalizeText(existing.name);
  if (csvName && csvName !== dbName) {
    changes.push(`name: "${dbName}" ${CHANGE_ARROW} "${csvName}"`);
  }

  const csvPrice = parseMoney2dp(csv.unitPrice);
  const dbPrice = parseMoney2dp(existing.unitPrice);
  if (csvPrice !== null && csvPrice !== (dbPrice ?? 0)) {
    changes.push(`unitPrice: ${(dbPrice ?? 0).toFixed(2)} ${CHANGE_ARROW} ${csvPrice.toFixed(2)}`);
  }

  const csvCost = parseMoney2dp(csv.costPrice);
  const dbCost = parseMoney2dp(existing.costPrice);
  if (csvCost !== null && csvCost !== (dbCost ?? 0)) {
    changes.push(`costPrice: ${(dbCost ?? 0).toFixed(2)} ${CHANGE_ARROW} ${csvCost.toFixed(2)}`);
  }

  const csvBarcode = normalizeText(csv.barcode);
  const dbBarcode = normalizeText(existing.barcode);
  if (csvBarcode && csvBarcode !== dbBarcode) {
    changes.push(`barcode: "${dbBarcode}" ${CHANGE_ARROW} "${csvBarcode}"`);
  }

  const csvCategory = normalizeText(csv.categoryName);
  const dbCategory = normalizeText(existing.categoryName);
  if (csvCategory && csvCategory !== dbCategory) {
    changes.push(`category: "${dbCategory}" ${CHANGE_ARROW} "${csvCategory}"`);
  }

  for (const loc of csv.locations) {
    if (!loc.apexLocationId) continue;
    if (!loc.stockLevelWasPresent) continue;
    const dbStock = existingStockByLocation.get(loc.apexLocationId) ?? 0;
    if (loc.stockLevel !== dbStock) {
      changes.push(`qty@${loc.csvLocationName}: ${dbStock} ${CHANGE_ARROW} ${loc.stockLevel}`);
    }
  }

  if (csv.isVariant) {
    const csvPairs: string[] = [];
    if (csv.option1Name && csv.option1Value)
      csvPairs.push(`${normalizeText(csv.option1Name)}=${normalizeText(csv.option1Value)}`);
    if (csv.option2Name && csv.option2Value)
      csvPairs.push(`${normalizeText(csv.option2Name)}=${normalizeText(csv.option2Value)}`);
    if (csv.option3Name && csv.option3Value)
      csvPairs.push(`${normalizeText(csv.option3Name)}=${normalizeText(csv.option3Value)}`);

    const dbPairs = existingVariantOptions.map(
      (p) => `${normalizeText(p.typeName)}=${normalizeText(p.value)}`,
    );

    const csvSet = new Set(csvPairs);
    const dbSet = new Set(dbPairs);
    const added = csvPairs.filter((x) => !dbSet.has(x));
    const removed = dbPairs.filter((x) => !csvSet.has(x));
    if (added.length > 0 || removed.length > 0) {
      changes.push("variant options changed");
    }
  }

  return changes;
}
