import type {
  CategoryMapping,
  LocationMapping,
  ParsedRow,
  PreviewResult,
  PreviewRowSummary,
} from "./types";

export interface PreviewCounts {
  createCount: number;
  updateCount: number;
  noChangeCount: number;
  skipCount: number;
}

export interface ParsedRowsSummary extends PreviewCounts {
  errors: Array<{ row: number; message: string }>;
}

export function summarizeParsedRows(
  rows: Array<Pick<ParsedRow, "action" | "errors" | "rowIndex" | "sku">>,
): ParsedRowsSummary {
  const summary: ParsedRowsSummary = {
    createCount: 0,
    updateCount: 0,
    noChangeCount: 0,
    skipCount: 0,
    errors: [],
  };

  for (const row of rows) {
    if (row.errors.length > 0) {
      summary.skipCount++;
      for (const error of row.errors) {
        summary.errors.push({ row: row.rowIndex, message: `[${row.sku || "no SKU"}] ${error}` });
      }
    } else if (row.action === "CREATE") {
      summary.createCount++;
    } else if (row.action === "UPDATE") {
      summary.updateCount++;
    } else {
      summary.noChangeCount++;
    }
  }

  return summary;
}

export function buildCategoryMapping(
  rows: Array<Pick<ParsedRow, "categoryName" | "action">>,
  orgCategories: Array<{ id: string; name: string }>,
): CategoryMapping[] {
  const csvCategoryCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.categoryName) {
      const key = row.categoryName.trim();
      if (key) csvCategoryCounts.set(key, (csvCategoryCounts.get(key) ?? 0) + 1);
    }
  }

  const csvCategoryActions = new Map<string, { create: number; update: number }>();
  for (const row of rows) {
    const key = row.categoryName?.trim().toLowerCase();
    if (key) {
      const entry = csvCategoryActions.get(key) ?? { create: 0, update: 0 };
      if (row.action === "CREATE") entry.create++;
      else if (row.action === "UPDATE") entry.update++;
      csvCategoryActions.set(key, entry);
    }
  }

  const categoryMapping: CategoryMapping[] = [];
  for (const [csvName, count] of csvCategoryCounts) {
    const match = orgCategories.find(
      (category) => category.name.trim().toLowerCase() === csvName.trim().toLowerCase(),
    );
    const actions = csvCategoryActions.get(csvName.trim().toLowerCase()) ?? { create: 0, update: 0 };
    categoryMapping.push({
      csvName,
      apexCategoryId: match?.id ?? null,
      apexCategoryName: match?.name ?? null,
      autoMatched: !!match,
      productCount: count,
      createCount: actions.create,
      updateCount: actions.update,
    });
  }

  return categoryMapping;
}

export function toPreviewRowSummary(row: ParsedRow): PreviewRowSummary {
  return {
    rowIndex: row.rowIndex,
    name: row.isVariant ? row.parentName : row.name,
    variantName: row.isVariant
      ? [row.option1Value, row.option2Value, row.option3Value].filter(Boolean).join(" / ") || null
      : null,
    sku: row.sku,
    action: row.action,
    changes: row.changes,
    errors: row.errors,
    isVariant: row.isVariant,
  };
}

export interface BuildPreviewResultOptions {
  previewToken: string;
  parsedRows: ParsedRow[];
  counts: PreviewCounts;
  errors: Array<{ row: number; message: string }>;
  locationMapping: LocationMapping[];
  categoryMapping: CategoryMapping[];
}

export function buildLoyversePreviewResult({
  previewToken,
  parsedRows,
  counts,
  errors,
  locationMapping,
  categoryMapping,
}: BuildPreviewResultOptions): PreviewResult {
  return {
    previewToken,
    format: "loyverse",
    totalRows: parsedRows.length,
    createCount: counts.createCount,
    updateCount: counts.updateCount,
    noChangeCount: counts.noChangeCount,
    skipCount: counts.skipCount,
    errorCount: errors.length,
    locationMapping,
    categoryMapping,
    errors,
    preview: parsedRows.slice(0, 100).map(toPreviewRowSummary),
    createPreview: parsedRows.filter((row) => row.action === "CREATE").map(toPreviewRowSummary),
    updatePreview: parsedRows.filter((row) => row.action === "UPDATE").map(toPreviewRowSummary),
    noChangePreview: parsedRows
      .filter((row) => row.action === "NO_CHANGE")
      .slice(0, 100)
      .map(toPreviewRowSummary),
  };
}
