import type { SalesByItemRow } from "@/hooks/use-sales-reports";
import { downloadCSV } from "@/lib/csv-export";

export function fmt(value: string | number) {
  return parseFloat(String(value)).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

export function exportSalesByItemCsv(items: SalesByItemRow[]) {
  downloadCSV(
    "sales-by-item",
    ["Item", "SKU", "Category", "Units Sold", "Revenue", "Cost", "Profit", "Margin %"],
    items.map((item) => [
      item.productName,
      item.sku,
      item.categoryName ?? "Uncategorized",
      String(item.unitsSold),
      item.totalRevenue,
      item.totalCost,
      item.grossProfit,
      `${item.marginPct}%`,
    ]),
  );
}
