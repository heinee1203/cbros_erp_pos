import type { CreateProductInput, VariantItem } from "@apex/types";

export function buildParentPlaceholderSku(now = Date.now()) {
  return `P-${now.toString(36).toUpperCase().slice(-8)}`;
}

export function buildCreateProductInsertValues({
  data,
  orgId,
  sku,
  mnemonicSku,
  hasVariants,
  barcode,
}: {
  data: CreateProductInput;
  orgId: string;
  sku: string;
  mnemonicSku: string;
  hasVariants: boolean;
  barcode: string | null;
}) {
  return {
    orgId,
    name: data.name,
    sku,
    mnemonicSku,
    category: data.category as any,
    unitPrice: hasVariants ? "0.00" : (data.unitPrice || "0.00"),
    costPrice: hasVariants ? "0.00" : (data.costPrice || "0.00"),
    barcode: hasVariants ? null : barcode,
    oemNumber: data.oemNumber || null,
    isParent: hasVariants ? true : (data.isParent ?? false),
    parentProductId: data.parentProductId || null,
    familyId: data.familyId || null,
    categoryId: data.categoryId || null,
    subcategoryId: data.subcategoryId || null,
    brandId: data.brandId || null,
    description: data.description || null,
    unitsPerCase: data.unitsPerCase ?? 1,
    packagingUnit: data.packagingUnit || null,
    sellingUnit: data.sellingUnit ?? "piece",
    purchaseUnit: data.purchaseUnit || null,
    conversionFactor: String(data.conversionFactor ?? 1),
    primarySupplierId: data.primarySupplierId || null,
    isSerialized: data.isSerialized ?? false,
    specialOrder: data.specialOrder ?? false,
  };
}

export function buildCreateVariantProductInsertValues({
  data,
  orgId,
  parentProductId,
  variant,
  name,
  mnemonicSku,
  barcode,
}: {
  data: CreateProductInput;
  orgId: string;
  parentProductId: string;
  variant: VariantItem;
  name: string;
  mnemonicSku: string;
  barcode: string;
}) {
  return {
    orgId,
    name,
    sku: variant.sku,
    mnemonicSku,
    category: data.category as any,
    unitPrice: variant.unitPrice || "0.00",
    costPrice: variant.costPrice || "0.00",
    barcode,
    oemNumber: data.oemNumber || null,
    isParent: false,
    parentProductId,
    familyId: data.familyId || null,
    categoryId: data.categoryId || null,
    subcategoryId: data.subcategoryId || null,
    brandId: data.brandId || null,
  };
}

export function buildCreateInventoryInsertValues({
  orgId,
  productId,
  locationId,
  stockLevel,
  reorderPoint,
  optimalStock,
  leadTimeDays,
}: {
  orgId: string;
  productId: string;
  locationId: string;
  stockLevel: number;
  reorderPoint: number;
  optimalStock?: number;
  leadTimeDays: number;
}) {
  return {
    orgId,
    productId,
    locationId,
    stockLevel,
    reorderPoint,
    optimalStock,
    leadTimeDays,
  };
}

export function resolveCreateMainInventoryStockLevel(
  targetLocationId: string,
  scopedLocationId: string | null | undefined,
  initialStock: number | null | undefined,
) {
  return targetLocationId === scopedLocationId ? (initialStock || 0) : 0;
}

export function buildVehicleCompatibilityInsertValues(
  productId: string,
  vehicleCompatibility: NonNullable<CreateProductInput["vehicleCompatibility"]>,
) {
  return vehicleCompatibility.map((vehicle) => ({
    productId,
    make: vehicle.make,
    model: vehicle.model,
    yearStart: vehicle.yearStart,
    yearEnd: vehicle.yearEnd,
    engine: vehicle.engine || null,
    notes: vehicle.notes || null,
  }));
}
