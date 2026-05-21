export interface VehicleEntry {
  id: string;
  make: string;
  model: string;
  yearStart: string;
  yearEnd: string;
  engine: string;
  notes: string;
}

export interface AttributeEntry {
  id: string;
  name: string;
  values: string;
}

export interface OptionTypeEntry {
  id: string;
  name: string;
  values: string;
}

export interface InlineVariant {
  id: string;
  suffix: string;
  sku: string;
  unitPrice: string;
  costPrice: string;
}
