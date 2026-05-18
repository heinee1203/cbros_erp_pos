export const HEADER_ALIASES: Record<string, string[]> = {
  name: ["Name", "Item name", "Item Name", "name", "item name"],
  sku: ["SKU", "Sku", "sku"],
  price: ["Default price", "Price", "default price", "price"],
  cost: ["Cost", "Purchase cost", "cost", "purchase cost"],
  barcode: ["Barcode", "barcode"],
  category: ["Category", "category"],
  subcategory: ["Sub-category", "sub-category", "Subcategory", "subcategory"],
  brand: ["Brand", "brand", "BRAND"],
  family: ["Family", "family", "FAMILY"],
  handle: ["Handle", "handle"],
  description: ["Description", "description"],
  trackStock: ["Track stock", "track stock"],
  supplier: ["Supplier", "supplier"],
  active: ["Active", "active", "ACTIVE"],
  unit: ["Unit", "unit", "Sold by", "sold by"],
  trackSerial: ["Track Serial", "track serial"],
  trackDot: ["Track DOT", "track dot", "Track Dot"],
  specialOrder: ["Special Order", "special order"],
  oemNumber: ["OEM Number", "oem number", "OEM", "oem"],
  option1Name: ["Option 1 name", "option 1 name", "Option 1", "option 1"],
  option1Value: ["Option 1 value", "option 1 value"],
  option2Name: ["Option 2 name", "option 2 name", "Option 2", "option 2"],
  option2Value: ["Option 2 value", "option 2 value"],
  option3Name: ["Option 3 name", "option 3 name", "Option 3", "option 3"],
  option3Value: ["Option 3 value", "option 3 value"],
  markup: ["Markup %", "markup %"],
  createdAt: ["Created at", "created at"],
  updatedAt: ["Updated at", "updated at"],
};

export function findColumn(headers: string[], field: string): number {
  const aliases = HEADER_ALIASES[field] ?? [field];
  return headers.findIndex((h) => aliases.includes(h.trim()));
}

export function isLoyverseFormat(headers: string[]): boolean {
  const hasName = findColumn(headers, "name") >= 0;
  const hasSku = findColumn(headers, "sku") >= 0;
  return hasName && hasSku;
}

export function parseCSV(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let cells: string[] = [];

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else if ((ch === "\n" || (ch === "\r" && clean[i + 1] === "\n")) && !inQuotes) {
      cells.push(current.trim());
      if (cells.some((c) => c)) rows.push(cells);
      cells = [];
      current = "";
      if (ch === "\r") i++;
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  if (cells.some((c) => c)) rows.push(cells);
  return rows;
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }

  result.push(current);
  return result;
}
