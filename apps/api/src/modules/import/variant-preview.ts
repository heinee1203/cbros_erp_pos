import { computeItemDiff } from "./diff-utils";
import type { ParsedRow } from "./types";

export interface ExistingVariantPreviewProduct {
  id: string;
  name: string | null;
  unitPrice: string | null;
  costPrice: string | null;
  barcode: string | null;
  categoryName: string | null;
}

export type ExistingProductsBySku = Map<string, ExistingVariantPreviewProduct>;
export type ExistingStockByProduct = Map<string, Map<string, number>>;
export type ExistingVariantOptionsByProduct = Map<
  string,
  Array<{ typeName: string; value: string }>
>;

function getVariantSuffix(row: ParsedRow): string {
  return [row.option1Value, row.option2Value, row.option3Value].filter(Boolean).join(" / ");
}

export function groupRowsByHandle(rows: ParsedRow[]): Map<string, ParsedRow[]> {
  const handleGroups = new Map<string, ParsedRow[]>();

  for (const row of rows) {
    if (!row.handle) continue;
    if (!handleGroups.has(row.handle)) handleGroups.set(row.handle, []);
    handleGroups.get(row.handle)!.push(row);
  }

  return handleGroups;
}

export function applyVariantGrouping(rows: ParsedRow[]): void {
  for (const [, groupRows] of groupRowsByHandle(rows)) {
    if (groupRows.length <= 1) {
      const row = groupRows[0];
      const hasOptionValue = row.option1Value?.trim();
      if (hasOptionValue) {
        const parentName = row.name.trim() || `Unknown (${row.handle})`;
        const variantSuffix = getVariantSuffix(row);
        row.isVariant = true;
        row.parentName = parentName;
        row.resolvedName = `${parentName} (${variantSuffix})`;
        if (variantSuffix) row.name = variantSuffix;
        row.errors = row.errors.filter((e) => e !== "Name is required");
      }
      continue;
    }

    const parentRow = groupRows.find((r) => r.name.trim()) || groupRows[0];
    const parentName = parentRow.name.trim() || `Unknown (${parentRow.handle})`;

    for (const row of groupRows) {
      const variantSuffix = getVariantSuffix(row);

      row.isVariant = true;
      row.parentName = parentName;
      row.resolvedName = variantSuffix ? `${parentName} (${variantSuffix})` : parentName;

      if (variantSuffix) {
        row.name = variantSuffix;
      }

      row.errors = row.errors.filter((e) => e !== "Name is required");
    }
  }
}

export function rediffVariantRows(
  rows: ParsedRow[],
  existingProductsBySku: ExistingProductsBySku,
  existingStockByProduct: ExistingStockByProduct,
  existingVariantOptionsByProduct: ExistingVariantOptionsByProduct,
): void {
  for (const row of rows) {
    if (!row.isVariant || !row.existingProductId || row.errors.length > 0) continue;

    const existing = existingProductsBySku.get(row.sku.toLowerCase());
    if (!existing) continue;

    row.changes = computeItemDiff(
      {
        name: existing.name,
        unitPrice: existing.unitPrice,
        costPrice: existing.costPrice,
        barcode: existing.barcode,
        categoryName: existing.categoryName,
      },
      {
        name: row.name,
        unitPrice: row.unitPrice,
        costPrice: row.costPrice,
        barcode: row.barcode,
        categoryName: row.categoryName,
        isVariant: true,
        option1Name: row.option1Name,
        option1Value: row.option1Value,
        option2Name: row.option2Name,
        option2Value: row.option2Value,
        option3Name: row.option3Name,
        option3Value: row.option3Value,
        locations: row.locations,
      },
      existingStockByProduct.get(existing.id) ?? new Map(),
      existingVariantOptionsByProduct.get(existing.id) ?? [],
    );
    row.action = row.changes.length > 0 ? "UPDATE" : "NO_CHANGE";
  }
}
