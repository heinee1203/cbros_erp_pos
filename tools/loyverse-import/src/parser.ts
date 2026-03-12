import fs from "fs";
import { parse } from "csv-parse/sync";

export interface LocationStock {
  availableForSale: boolean;
  price: string;
  inStock: number;
  lowStock: number;
  optimalStock: number;
}

export interface LoyverseRow {
  handle: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  defaultPrice: string; // "variable" or numeric string
  cost: string;
  barcode: string;
  trackStock: boolean;
  supplier: string;
  purchaseCost: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  locationData: Map<string, LocationStock>;
}

export function parseCSV(csvPath: string): {
  rows: LoyverseRow[];
  detectedLocations: string[];
} {
  const content = fs.readFileSync(csvPath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Detect location names from "In stock [X]" headers
  const firstRow = records[0] || {};
  const locationNames: string[] = [];
  for (const key of Object.keys(firstRow)) {
    const match = key.match(/^In stock \[(.+)\]$/);
    if (match) locationNames.push(match[1]);
  }

  console.log(
    `  Detected ${locationNames.length} locations: ${locationNames.join(", ")}`,
  );

  const rows: LoyverseRow[] = records.map((r: any) => {
    const locationData = new Map<string, LocationStock>();
    for (const loc of locationNames) {
      locationData.set(loc, {
        availableForSale:
          r[`Available for sale [${loc}]`]?.toUpperCase() === "Y",
        price: r[`Price [${loc}]`] || "",
        inStock: parseFloat(r[`In stock [${loc}]`] || "0") || 0,
        lowStock: parseFloat(r[`Low stock [${loc}]`] || "0") || 0,
        optimalStock: parseFloat(r[`Optimal stock [${loc}]`] || "0") || 0,
      });
    }

    return {
      handle: r.Handle || "",
      sku: r.SKU || "",
      name: r.Name || "",
      category: r.Category || "",
      description: r.Description || "",
      defaultPrice: r["Default price"] || "0",
      cost: r.Cost || "",
      barcode: r.Barcode?.trim() || "",
      trackStock: r["Track stock"]?.toUpperCase() === "Y",
      supplier: r.Supplier || "",
      purchaseCost: r["Purchase cost"] || "",
      option1Name: r["Option 1 name"] || "",
      option1Value: r["Option 1 value"] || "",
      option2Name: r["Option 2 name"] || "",
      option2Value: r["Option 2 value"] || "",
      option3Name: r["Option 3 name"] || "",
      option3Value: r["Option 3 value"] || "",
      locationData,
    };
  });

  return { rows, detectedLocations: locationNames };
}
