export interface BulkProductUpdateInput {
  categoryId?: string;
  brandId?: string;
  familyId?: string;
  subcategoryId?: string;
  specialOrder?: boolean;
  isSerialized?: boolean;
  warrantyMonths?: number | null;
  isTire?: boolean;
  maxTireAgeYears?: number | null;
  discontinued?: boolean;
}

export type BulkFindReplaceField = "name" | "sku" | "oem";

export function buildBulkProductUpdateFields(
  updates: BulkProductUpdateInput,
): Record<string, unknown> {
  const updateFields: Record<string, unknown> = {};

  if (updates.categoryId !== undefined) updateFields.categoryId = updates.categoryId;
  if (updates.specialOrder !== undefined) updateFields.specialOrder = updates.specialOrder;
  if (updates.discontinued !== undefined) updateFields.discontinued = updates.discontinued;
  if (updates.brandId !== undefined) updateFields.brandId = updates.brandId;
  if (updates.familyId !== undefined) updateFields.familyId = updates.familyId;
  if (updates.subcategoryId !== undefined) updateFields.subcategoryId = updates.subcategoryId;
  if (updates.isSerialized !== undefined) updateFields.isSerialized = updates.isSerialized;
  if (updates.warrantyMonths !== undefined) updateFields.warrantyMonths = updates.warrantyMonths;
  if (updates.isTire !== undefined) updateFields.isTire = updates.isTire;
  if (updates.maxTireAgeYears !== undefined) updateFields.maxTireAgeYears = updates.maxTireAgeYears;

  return updateFields;
}

export function getBulkProductIdsLimitError(
  productIds: string[] | undefined,
  maxItems: number,
): string | null {
  return productIds && productIds.length > maxItems
    ? `Maximum ${maxItems} items per request`
    : null;
}

export function resolveBulkFindReplaceColumn(field: string): string | null {
  if (field === "name") return "name";
  if (field === "sku") return "sku";
  if (field === "oem") return "oem_number";
  return null;
}

export function buildPostgresUuidArrayLiteral(productIds: string[]): string {
  return `{${productIds.join(",")}}`;
}
