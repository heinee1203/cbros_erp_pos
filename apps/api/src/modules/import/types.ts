import type { ImportAuditMetadata } from "./import-audit";

export interface LocationMapping {
  csvName: string;
  apexLocationId: string | null;
  apexLocationName: string | null;
  autoMatched: boolean;
}

export interface CategoryMapping {
  csvName: string;
  apexCategoryId: string | null;
  apexCategoryName: string | null;
  autoMatched: boolean;
  productCount: number;
  createCount: number;
  updateCount: number;
}

export interface ParsedRowLocation {
  csvLocationName: string;
  apexLocationId: string | null;
  stockLevel: number;
  /** True iff the CSV row had a non-empty `In stock [X]` cell for this location. */
  stockLevelWasPresent: boolean;
  available: boolean;
  reorderPoint: number | null;
  optimalStock: number | null;
}

/** Row classification after diffing CSV values against the DB row. */
export type RowAction = "CREATE" | "UPDATE" | "NO_CHANGE";

export interface ParsedRow {
  rowIndex: number;
  name: string;
  sku: string;
  barcode: string;
  costPrice: string;
  unitPrice: string;
  isVariablePrice: boolean;
  categoryName: string;
  brandName: string;
  description: string;
  handle: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  resolvedName: string;
  isVariant: boolean;
  parentName: string;
  active: boolean | null;
  sellingUnit: string;
  trackSerial: boolean | null;
  trackDot: boolean | null;
  specialOrder: boolean | null;
  oemNumber: string;
  supplierName: string;
  locations: ParsedRowLocation[];
  action: RowAction;
  existingProductId: string | null;
  changes: string[];
  errors: string[];
}

export interface PreviewRowSummary {
  rowIndex: number;
  name: string;
  variantName: string | null;
  sku: string;
  action: RowAction;
  changes: string[];
  errors: string[];
  isVariant?: boolean;
}

export interface PreviewResult {
  previewToken: string;
  format: "loyverse";
  totalRows: number;
  createCount: number;
  updateCount: number;
  noChangeCount: number;
  skipCount: number;
  errorCount: number;
  locationMapping: LocationMapping[];
  categoryMapping: CategoryMapping[];
  errors: Array<{ row: number; message: string }>;
  preview: PreviewRowSummary[];
  createPreview: PreviewRowSummary[];
  updatePreview: PreviewRowSummary[];
  noChangePreview: PreviewRowSummary[];
}

export interface ExecuteOptions {
  previewToken: string;
  importMode?: "smart_sync" | "create_only" | "update_only" | "inventory_sync";
  fileName?: string;
  userId?: string;
  ipAddress?: string;
  locationMapping?: Record<string, string>;
  categoryMapping?: Record<
    string,
    {
      action: "create" | "map" | "skip";
      targetCategoryId?: string;
      targetSubcategoryId?: string;
      familyId?: string;
      createSubcategory?: boolean;
    }
  >;
  skipErrors?: boolean;
  createNewCategories?: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  noChange: number;
  errors: number;
  errorLog: Array<{ row: number; message: string }>;
  duration: number;
  audit?: ImportAuditMetadata;
}

export interface ProgressUpdate {
  status: "running" | "completed" | "failed";
  processed: number;
  total: number;
  percent: number;
  created: number;
  updated: number;
  noChange?: number;
  errors: number;
  errorLog?: Array<{ row: number; message: string }>;
  audit?: ImportAuditMetadata;
}
