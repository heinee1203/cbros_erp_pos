import { products } from "@apex/database/schema";
import type { ImportMode } from "./execution-utils";

type ProductInsert = typeof products.$inferInsert;

export interface ImportProductFieldRow {
  name: string;
  sku: string;
  unitPrice: string;
  costPrice: string;
  isVariablePrice: boolean;
  barcode: string;
  description: string;
  sellingUnit: string;
  trackSerial: boolean | null;
  trackDot: boolean | null;
  specialOrder: boolean | null;
  active: boolean | null;
  oemNumber: string;
}

export interface BuildImportProductInsertOptions {
  orgId: string;
  row: ImportProductFieldRow;
  mnemonicSku: string;
  barcode: string;
  parentProductId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  brandId: string | null;
  mode: ImportMode;
}

export function buildInventorySyncPriceFields(row: ImportProductFieldRow): Record<string, unknown> {
  const priceFields: Record<string, unknown> = {};
  if (row.unitPrice && row.unitPrice !== "0.00") priceFields.unitPrice = row.unitPrice;
  if (row.costPrice && row.costPrice !== "0.00") priceFields.costPrice = row.costPrice;
  if (row.isVariablePrice) priceFields.isVariablePrice = true;
  return priceFields;
}

export function buildUpdateOnlyProductFields(row: ImportProductFieldRow): Record<string, unknown> {
  const updateFields: Record<string, unknown> = {};
  if (row.unitPrice && row.unitPrice !== "0.00") updateFields.unitPrice = row.unitPrice;
  if (row.barcode) updateFields.barcode = row.barcode;
  return updateFields;
}

export function buildImportProductInsert({
  orgId,
  row,
  mnemonicSku,
  barcode,
  parentProductId,
  categoryId,
  subcategoryId,
  brandId,
  mode,
}: BuildImportProductInsertOptions): ProductInsert {
  return {
    orgId,
    name: row.name,
    sku: row.sku,
    mnemonicSku,
    unitPrice: row.unitPrice,
    costPrice: row.costPrice,
    isVariablePrice: row.isVariablePrice,
    barcode,
    category: "HARD_PARTS",
    categoryId: mode === "inventory_sync" ? null : categoryId,
    subcategoryId: mode === "inventory_sync" ? null : subcategoryId,
    brandId: mode === "inventory_sync" ? null : brandId,
    description: row.description || null,
    parentProductId,
    isParent: false,
    ...(row.sellingUnit ? { sellingUnit: row.sellingUnit } : {}),
    ...(row.trackSerial != null ? { isSerialized: row.trackSerial } : {}),
    ...(row.trackDot != null ? { isTire: row.trackDot } : {}),
    ...(row.specialOrder != null ? { specialOrder: row.specialOrder } : {}),
    ...(row.active != null ? { isActive: row.active, discontinued: !row.active } : {}),
    ...(row.oemNumber ? { oemNumber: row.oemNumber } : {}),
  };
}

export function buildImportProductUpdateFields(
  row: ImportProductFieldRow,
  mode: ImportMode,
): Record<string, unknown> {
  if (mode === "inventory_sync") {
    return buildInventorySyncPriceFields(row);
  }
  if (mode === "update_only") {
    return buildUpdateOnlyProductFields(row);
  }

  const updateFields: Record<string, unknown> = {};
  if (row.unitPrice !== "0.00") updateFields.unitPrice = row.unitPrice;
  if (row.costPrice !== "0.00") updateFields.costPrice = row.costPrice;
  if (row.isVariablePrice) updateFields.isVariablePrice = true;
  if (row.barcode) updateFields.barcode = row.barcode;
  if (row.oemNumber) updateFields.oemNumber = row.oemNumber;
  if (row.sellingUnit) updateFields.sellingUnit = row.sellingUnit;
  if (row.trackSerial != null) updateFields.isSerialized = row.trackSerial;
  if (row.trackDot != null) updateFields.isTire = row.trackDot;
  if (row.specialOrder != null) updateFields.specialOrder = row.specialOrder;
  if (row.active != null) {
    updateFields.isActive = row.active;
    updateFields.discontinued = !row.active;
  }
  return updateFields;
}

export function buildParentImportSku(now = Date.now, random = Math.random): string {
  return `P-${now().toString(36).toUpperCase().slice(-8)}-${random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

export interface BuildParentProductInsertOptions {
  orgId: string;
  parentName: string;
  parentSku: string;
  parentMnemonic: string;
  parentCategoryId: string | null;
  parentBrandId: string | null;
}

export function buildParentProductInsert({
  orgId,
  parentName,
  parentSku,
  parentMnemonic,
  parentCategoryId,
  parentBrandId,
}: BuildParentProductInsertOptions): ProductInsert {
  return {
    orgId,
    name: parentName,
    sku: parentSku,
    mnemonicSku: parentMnemonic,
    category: "HARD_PARTS",
    unitPrice: "0.00",
    costPrice: "0.00",
    isParent: true,
    categoryId: parentCategoryId,
    brandId: parentBrandId,
  };
}
