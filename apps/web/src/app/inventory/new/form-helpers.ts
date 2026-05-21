import type {
  AttributeEntry,
  InlineVariant,
  OptionTypeEntry,
  VehicleEntry,
} from "./types";

export function createInlineVariant({
  unitPrice,
  costPrice,
}: {
  unitPrice: string;
  costPrice: string;
}): InlineVariant {
  return {
    id: crypto.randomUUID(),
    suffix: "",
    sku: "",
    unitPrice: unitPrice || "",
    costPrice: costPrice || "",
  };
}

export function createAttributeEntry(): AttributeEntry {
  return { id: crypto.randomUUID(), name: "", values: "" };
}

export function createOptionTypeEntry(): OptionTypeEntry {
  return { id: crypto.randomUUID(), name: "", values: "" };
}

export function createVehicleEntry(): VehicleEntry {
  return {
    id: crypto.randomUUID(),
    make: "",
    model: "",
    yearStart: "",
    yearEnd: "",
    engine: "",
    notes: "",
  };
}

export function makeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
