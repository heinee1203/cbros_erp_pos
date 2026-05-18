export type Step = "upload" | "parsing" | "preview" | "progress" | "results";
export type ImportMode = "smart_sync" | "update_only" | "create_only" | "inventory_sync";

export interface PreviewRow {
  row: number;
  sku: string;
  name: string;
  action: "CREATE" | "UPDATE" | "NO_CHANGE" | "SKIP";
  changes?: string[];
}

export interface PreviewError {
  row: number;
  field?: string;
  message: string;
}

export interface LocationMatch {
  csvName: string;
  apexId: string | null;
  apexName: string | null;
  matched: boolean;
}

export interface PreviewSummaryRow {
  rowIndex: number;
  name: string;
  sku: string;
  action: "CREATE" | "UPDATE" | "NO_CHANGE" | "SKIP";
  changes?: string[];
  errors?: string[];
  variantName?: string | null;
  isVariant?: boolean;
}

export interface PreviewResponse {
  previewToken: string;
  format: string;
  totalRows: number;
  createCount: number;
  updateCount: number;
  /** Rows whose CSV values match the DB on every tracked field and are skipped on import. */
  noChangeCount: number;
  skipCount: number;
  errorCount: number;
  locationMapping: Array<{
    csvName: string;
    apexLocationId: string | null;
    apexLocationName: string | null;
    autoMatched: boolean;
  }>;
  categoryMapping: Array<{
    csvName: string;
    apexCategoryId: string | null;
    apexCategoryName: string | null;
    autoMatched: boolean;
    productCount: number;
    createCount: number;
    updateCount: number;
  }>;
  errors: Array<{ rowIndex: number; field?: string; message: string }>;
  /** First 100 parsed rows with any action. */
  preview: PreviewSummaryRow[];
  createPreview?: PreviewSummaryRow[];
  updatePreview?: PreviewSummaryRow[];
  noChangePreview?: PreviewSummaryRow[];
}

export interface ProgressResponse {
  status: "running" | "done" | "completed" | "error" | "failed";
  processed: number;
  total: number;
  created: number;
  updated: number;
  /** Rows skipped because of validation errors or import mode filters. */
  skipped: number;
  /** Rows classified as NO_CHANGE and silently skipped by the import loop. */
  noChange?: number;
  errors: number;
  errorLog?: { row: number; message: string }[];
  durationMs?: number;
  duration?: number;
  audit?: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    mode: ImportMode;
    fileName: string | null;
    rowSnapshotCount: number;
    createdAt: string;
  };
}

export interface ImportRollbackConflict {
  rowIndex: number;
  sku: string;
  name: string;
  entity: "product" | "inventory";
  field: string;
  reason: string;
  beforeValue: unknown;
  expectedAfterValue: unknown;
  currentValue: unknown;
}

export interface ImportRollbackSkippedRow {
  rowIndex: number;
  sku: string;
  name: string;
  reason: string;
}

export interface ImportRollbackResult {
  dryRun: boolean;
  audit: ProgressResponse["audit"] | null;
  summary: {
    rowsScanned: number;
    updatedRows: number;
    createdRowsSkipped: number;
    restorableFields: number;
    restoredFields: number;
    alreadyRestoredFields: number;
    conflictedFields: number;
    skippedRows: number;
  };
  conflicts: ImportRollbackConflict[];
  skipped: ImportRollbackSkippedRow[];
  appliedAt?: string;
}

export interface LocationOption {
  id: string;
  name: string;
}

export type CategoryMappingChoice = {
  action: "create" | "map" | "skip";
  targetCategoryId?: string;
  targetSubcategoryId?: string;
  familyId?: string;
  createSubcategory?: boolean;
};

export interface ImportProfile {
  id: string;
  orgId: string;
  name: string;
  importType: "items";
  importMode: ImportMode;
  locationMapping: Record<string, string>;
  categoryMapping: Record<string, CategoryMappingChoice>;
  includeCreates: boolean;
  includeUpdates: boolean;
  includeNoChange: boolean;
  createNewCategories: boolean;
  fieldLockPolicyVersion: string;
  createdAt: string;
  updatedAt: string;
}
