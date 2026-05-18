import { parseCSVLine } from "./csv-utils";

export interface ReceiptRow {
  date: string;
  receiptNumber: string;
  receiptType: string;
  category: string;
  sku: string;
  item: string;
  variant: string;
  quantity: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  costOfGoods: number;
  taxes: number;
  pos: string;
  store: string;
  cashierName: string;
  customerName: string;
  status: string;
}

export function parseReceiptRows(csvText: string): ReceiptRow[] {
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV file is empty or has no data rows");

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    headerMap[h.trim()] = i;
  });

  const requiredCols = ["Date", "Receipt number", "Receipt type", "SKU", "Quantity", "Net sales", "Store", "Status"];
  const missingCols = requiredCols.filter((c) => headerMap[c] === undefined);
  if (missingCols.length > 0) {
    if (headerMap["Date"] === undefined || headerMap["Receipt number"] === undefined) {
      throw new Error(
        `Missing required columns: ${missingCols.join(", ")}. Is this a Loyverse Receipts by Item export?`,
      );
    }
  }

  const getCol = (row: string[], col: string): string => {
    const idx = headerMap[col];
    return idx !== undefined ? (row[idx] || "").trim() : "";
  };

  const parsedRows: ReceiptRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue;

    const status = getCol(cols, "Status");
    const dateStr = getCol(cols, "Date");
    if (!dateStr) continue;

    parsedRows.push({
      date: dateStr,
      receiptNumber: getCol(cols, "Receipt number"),
      receiptType: getCol(cols, "Receipt type"),
      category: getCol(cols, "Category"),
      sku: getCol(cols, "SKU"),
      item: getCol(cols, "Item") || getCol(cols, "Item name"),
      variant: getCol(cols, "Variant"),
      quantity: parseFloat(getCol(cols, "Quantity")) || 0,
      grossSales: parseFloat(getCol(cols, "Gross sales")) || 0,
      discounts: parseFloat(getCol(cols, "Discounts")) || 0,
      netSales: parseFloat(getCol(cols, "Net sales")) || 0,
      costOfGoods: parseFloat(getCol(cols, "Cost of goods")) || 0,
      taxes: parseFloat(getCol(cols, "Taxes")) || 0,
      pos: getCol(cols, "POS"),
      store: getCol(cols, "Store"),
      cashierName: getCol(cols, "Cashier name"),
      customerName: getCol(cols, "Customer name"),
      status,
    });
  }

  return parsedRows;
}

export function parseReceiptDate(dateStr: string): Date | null {
  const [datePart, timePart] = dateStr.split(" ");
  if (!datePart) return null;
  const [day, month, year] = datePart.split("/");
  if (!day || !month || !year) return null;
  const isoStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timePart || "00:00"}:00+08:00`;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? null : d;
}
