import type { SalesByEmployeeRow } from "@/hooks/use-sales-reports";
import { downloadCSV } from "@/lib/csv-export";

export const RANK_COLORS: Record<number, string> = {
  1: "text-amber-500 font-bold",
  2: "text-slate-400 font-bold",
  3: "text-amber-700 font-bold",
};

export function fmtCurrency(value: string | number) {
  return "\u20B1" + parseFloat(String(value)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNumber(value: number | string) {
  return Number(value).toLocaleString("en-PH");
}

export function exportSalesByEmployeeCsv(employees: SalesByEmployeeRow[]) {
  downloadCSV(
    "sales-by-employee",
    ["Rank", "Employee", "Sales", "Revenue", "Avg Sale", "Discounts", "Refunds"],
    employees.map((employee, index) => [
      String(index + 1),
      employee.employeeName,
      String(employee.totalSales),
      String(parseFloat(employee.totalRevenue).toFixed(2)),
      String(parseFloat(employee.avgSaleValue).toFixed(2)),
      String(parseFloat(employee.totalDiscounts).toFixed(2)),
      String(employee.refundCount),
    ]),
  );
}
