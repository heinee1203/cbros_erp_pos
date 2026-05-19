import { downloadCSV } from "@/lib/csv-export";
import type { CategorySalesRow } from "./types";

export const EXCLUDED_CATEGORIES = new Set(["count", "price add", "payment", "labor"]);

export function fmtCurrency(value: string | number) {
  return "\u20B1" + parseFloat(String(value)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNumber(value: number) {
  return value.toLocaleString("en-PH");
}

export function categoryDisplayName(category: CategorySalesRow) {
  return category.categoryName ?? category.category?.replace("_", " ") ?? "Uncategorized";
}

export function exportSalesByCategoryCsv(categories: CategorySalesRow[]) {
  downloadCSV(
    "sales-by-category",
    ["Category", "Units Sold", "Revenue", "Profit", "Margin %", "SKUs"],
    categories.map((category) => [
      categoryDisplayName(category),
      String(category.unitsSold),
      String(parseFloat(category.totalRevenue).toFixed(2)),
      String(parseFloat(category.grossProfit).toFixed(2)),
      `${category.marginPct}%`,
      String(category.uniqueProducts),
    ]),
  );
}
