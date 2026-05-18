import type { ExecuteOptions, LocationMapping, ParsedRow, ProgressUpdate, RowAction } from "./types";

export type ImportMode = NonNullable<ExecuteOptions["importMode"]>;

export interface ImportProgressCounts {
  created: number;
  updated: number;
  noChange: number;
  errors: number;
}

interface LocationOverrideTarget {
  csvLocationName: string;
  apexLocationId: string | null;
}

export function resolveImportMode(mode: ExecuteOptions["importMode"]): ImportMode {
  return mode || "smart_sync";
}

export function filterRowsForImportMode<T extends { action: RowAction; errors: unknown[] }>(
  rows: T[],
  mode: ImportMode,
): T[] {
  if (mode === "create_only") {
    return rows.filter((row) => row.action === "CREATE" || row.errors.length > 0);
  }
  if (mode === "update_only") {
    return rows.filter((row) => row.action === "UPDATE" || row.errors.length > 0);
  }
  return rows;
}

export function isProtectedUpdateImportMode(mode: ImportMode): boolean {
  return mode === "inventory_sync" || mode === "update_only";
}

export function applyProtectedImportMetadataBlock(
  mode: ImportMode,
  rows: Array<Pick<ParsedRow, "categoryName" | "brandName">>,
  options: ExecuteOptions,
): void {
  if (!isProtectedUpdateImportMode(mode)) return;

  for (const row of rows) {
    row.categoryName = "";
    row.brandName = "";
  }

  delete options.categoryMapping;
  options.createNewCategories = false;
}

export function filterUpdateOnlyChanges(changes: string[]): string[] {
  return changes.filter(
    (change) =>
      change.startsWith("unitPrice") ||
      change.startsWith("barcode") ||
      change.startsWith("qty@"),
  );
}

export function hasUpdateOnlyQuantityWrite(row: Pick<ParsedRow, "locations">): boolean {
  return row.locations.some((loc) => Boolean(loc.apexLocationId) && loc.stockLevelWasPresent);
}

export function applyUpdateOnlyChangeScope(rows: ParsedRow[]): void {
  for (const row of rows) {
    if (row.action !== "UPDATE") continue;
    row.changes = filterUpdateOnlyChanges(row.changes);
    if (row.changes.length === 0 && !hasUpdateOnlyQuantityWrite(row)) {
      row.action = "NO_CHANGE";
    }
  }
}

export function applyLocationMappingOverrides(
  overrides: ExecuteOptions["locationMapping"],
  locationMapping: LocationMapping[],
  rows: Array<{ locations: LocationOverrideTarget[] }>,
): void {
  if (!overrides) return;

  for (const mapping of locationMapping) {
    const override = overrides[mapping.csvName];
    if (override) {
      mapping.apexLocationId = override;
      mapping.autoMatched = false;
    }
  }

  for (const row of rows) {
    for (const loc of row.locations) {
      const override = overrides[loc.csvLocationName];
      if (override) {
        loc.apexLocationId = override;
      }
    }
  }
}

export function shouldSkipForImportMode(mode: ImportMode, action: RowAction): boolean {
  return (mode === "create_only" && action === "UPDATE") || (mode === "update_only" && action === "CREATE");
}

export function createInitialProgress(total: number): ProgressUpdate {
  return {
    status: "running",
    processed: 0,
    total,
    percent: 0,
    created: 0,
    updated: 0,
    noChange: 0,
    errors: 0,
  };
}

export function createRunningProgress(
  processed: number,
  total: number,
  counts: ImportProgressCounts,
): ProgressUpdate {
  return {
    status: "running",
    processed,
    total,
    percent: total > 0 ? Math.round((processed / total) * 100) : 0,
    created: counts.created,
    updated: counts.updated,
    noChange: counts.noChange,
    errors: counts.errors,
  };
}

export function createCompletedProgress(
  total: number,
  counts: ImportProgressCounts,
  errorLog: Array<{ row: number; message: string }>,
  audit?: ProgressUpdate["audit"],
): ProgressUpdate {
  const progress: ProgressUpdate = {
    status: "completed",
    processed: total,
    total,
    percent: 100,
    created: counts.created,
    updated: counts.updated,
    noChange: counts.noChange,
    errors: counts.errors,
    errorLog,
  };
  if (audit) progress.audit = audit;
  return progress;
}
