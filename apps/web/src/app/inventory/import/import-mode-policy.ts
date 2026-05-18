import type { ImportMode, PreviewResponse, PreviewSummaryRow } from "./types";

export const IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION = "item-import-field-scope-v1";

export type ImportModeFieldLockPolicy = {
  title: string;
  badge: string;
  whatWillChange: string[];
  lockedFields: string[];
  note: string;
  criticalCopy?: string;
  tone: "strict" | "safe" | "broad";
};

export const IMPORT_MODE_FIELD_LOCK_POLICIES: Record<ImportMode, ImportModeFieldLockPolicy> = {
  create_only: {
    title: "New Items Only field lock",
    badge: "Existing items locked",
    whatWillChange: [
      "New products only",
      "Initial barcode and pricing for new rows",
      "Initial stock for mapped locations",
      "Initial brand, category, and item details for new rows",
    ],
    lockedFields: [
      "All existing products",
      "Existing barcode",
      "Existing selling price",
      "Existing quantity",
      "Existing brand/category",
      "Existing item names",
      "Existing descriptions",
      "Existing variants/options",
    ],
    note: "Rows matched to an existing SKU are skipped instead of updated.",
    tone: "safe",
  },
  inventory_sync: {
    title: "Stock & Availability field lock",
    badge: "Catalog details locked",
    whatWillChange: [
      "Selling price",
      "Cost price",
      "Variable price flag",
      "Quantity for mapped locations",
      "Availability and stock thresholds",
    ],
    lockedFields: [
      "Brand",
      "Category",
      "Sub-category",
      "Item name",
      "Description",
      "Barcode",
      "Variants/options",
      "OEM and selling unit",
      "Serialized/DOT flags",
      "Special-order flags",
    ],
    note: "CSV taxonomy and identity fields are ignored in this protected mode.",
    tone: "safe",
  },
  smart_sync: {
    title: "Full Sync field scope",
    badge: "Broad catalog update",
    whatWillChange: [
      "Product identity and descriptions",
      "Brand/category mappings",
      "Barcode, OEM, and selling unit",
      "Prices and inventory quantities",
      "Variants/options when present",
    ],
    lockedFields: [
      "Fields not present in the CSV",
      "Fields blocked by validation errors",
      "Rows excluded by preview toggles",
    ],
    note: "Use Full Sync only when the CSV should be the source of truth for matched items.",
    tone: "broad",
  },
  update_only: {
    title: "Update Only safety lock",
    badge: "Only 3 fields can change",
    whatWillChange: [
      "Barcode",
      "Quantity for mapped locations",
      "Selling price",
    ],
    lockedFields: [
      "Brand",
      "Category",
      "Sub-category",
      "Item name",
      "Description",
      "Variants/options",
      "Availability flags",
      "Reorder fields",
      "Low/optimal stock fields",
      "Cost price",
      "OEM and selling unit",
      "Serialized/DOT flags",
      "Special-order flags",
      "Other protected fields",
    ],
    note: "Rows with only locked-field changes are treated as No Change.",
    criticalCopy: "Update Only will only update barcode, quantity, and selling price. Brand, category, item names, descriptions, variants, availability flags, and reorder fields will not be touched.",
    tone: "strict",
  },
};

export function getImportModeFieldLockPolicy(importMode: ImportMode): ImportModeFieldLockPolicy {
  return IMPORT_MODE_FIELD_LOCK_POLICIES[importMode];
}

export function isUpdateOnlyAllowedChange(change: string): boolean {
  return (
    change.startsWith("unitPrice") ||
    change.startsWith("barcode") ||
    change.startsWith("qty@")
  );
}

export function isInventorySyncAllowedChange(change: string): boolean {
  return (
    change.startsWith("unitPrice") ||
    change.startsWith("costPrice") ||
    change.startsWith("isVariablePrice") ||
    change.startsWith("qty@")
  );
}

export function filterPreviewChangesForMode(changes: string[], importMode: ImportMode): string[] {
  if (importMode === "inventory_sync") {
    return changes.filter(isInventorySyncAllowedChange);
  }
  if (importMode === "update_only") {
    return changes.filter(isUpdateOnlyAllowedChange);
  }
  return changes;
}

export function hasUpdateOnlyAllowedChange(row: PreviewSummaryRow): boolean {
  return (row.changes ?? []).some(isUpdateOnlyAllowedChange);
}

export function getModeScopedUpdateRows(
  preview: PreviewResponse,
  importMode: ImportMode,
): PreviewSummaryRow[] {
  const rows = preview.updatePreview ?? [];
  return importMode === "update_only" ? rows.filter(hasUpdateOnlyAllowedChange) : rows;
}

export function getModeScopedUpdateCount(preview: PreviewResponse, importMode: ImportMode): number {
  return getModeScopedUpdateRows(preview, importMode).length;
}
