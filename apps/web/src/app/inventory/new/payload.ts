import type { InlineVariant, VehicleEntry } from "./types";
import { familyToEnum } from "./utils";

type BuildNewItemPayloadInput = {
  name: string;
  sku: string;
  hasInlineVariants: boolean;
  selectedFamilyName: string;
  unitPrice: string;
  showCost: boolean;
  costPrice: string;
  barcode: string;
  oemNumber: string;
  familyId: string;
  categoryId: string;
  subcategoryId: string;
  brandId: string;
  description: string;
  trackInventory: boolean;
  reorderPoint: string;
  optimalStock: string;
  leadTimeDays: string;
  unitsPerCase: number;
  packagingUnit: string | null;
  sellingUnit: string;
  purchaseUnit: string;
  conversionFactor: string;
  initialStock: string;
  selectedLocations: Set<string>;
  vehicles: VehicleEntry[];
  inlineVariants: InlineVariant[];
};

export function buildNewItemPayload({
  name,
  sku,
  hasInlineVariants,
  selectedFamilyName,
  unitPrice,
  showCost,
  costPrice,
  barcode,
  oemNumber,
  familyId,
  categoryId,
  subcategoryId,
  brandId,
  description,
  trackInventory,
  reorderPoint,
  optimalStock,
  leadTimeDays,
  unitsPerCase,
  packagingUnit,
  sellingUnit,
  purchaseUnit,
  conversionFactor,
  initialStock,
  selectedLocations,
  vehicles,
  inlineVariants,
}: BuildNewItemPayloadInput) {
  return {
    name: name.trim(),
    sku: hasInlineVariants ? "" : sku.trim(),
    category: familyToEnum(selectedFamilyName),
    unitPrice: unitPrice || "0.00",
    costPrice: showCost ? costPrice || "0.00" : "0.00",
    barcode: hasInlineVariants ? undefined : barcode.trim() || undefined,
    oemNumber: oemNumber.trim() || undefined,
    familyId: familyId || null,
    categoryId: categoryId || null,
    subcategoryId: subcategoryId || null,
    brandId: brandId || undefined,
    isParent: hasInlineVariants || undefined,
    description: description || undefined,
    trackInventory,
    reorderPoint: parseInt(reorderPoint, 10) || 5,
    optimalStock: parseInt(optimalStock, 10) || 0,
    leadTimeDays: parseInt(leadTimeDays, 10) || 7,
    unitsPerCase: unitsPerCase > 1 ? unitsPerCase : undefined,
    packagingUnit: packagingUnit || undefined,
    sellingUnit: sellingUnit || "piece",
    purchaseUnit: purchaseUnit || null,
    conversionFactor: purchaseUnit ? parseFloat(conversionFactor) || 1 : 1,
    initialStock: hasInlineVariants
      ? 0
      : trackInventory
        ? parseInt(initialStock, 10) || 0
        : 0,
    locationIds: Array.from(selectedLocations),
    vehicleCompatibility:
      vehicles.length > 0
        ? vehicles
            .filter((vehicle) => vehicle.make && vehicle.model)
            .map((vehicle) => ({
              make: vehicle.make,
              model: vehicle.model,
              yearStart: vehicle.yearStart ? parseInt(vehicle.yearStart, 10) : 0,
              yearEnd: vehicle.yearEnd ? parseInt(vehicle.yearEnd, 10) : 0,
              engine: vehicle.engine || undefined,
              notes: vehicle.notes || undefined,
            }))
        : undefined,
    variants: hasInlineVariants
      ? inlineVariants.map((variant) => ({
          suffix: variant.suffix.trim(),
          sku: variant.sku.trim(),
          unitPrice: variant.unitPrice || unitPrice || "0.00",
          costPrice: showCost
            ? variant.costPrice || costPrice || "0.00"
            : "0.00",
        }))
      : undefined,
  };
}
