import Link from "next/link";
import type { ReactNode } from "react";
import type { SalesByEmployeeRow } from "@/hooks/use-sales-reports";
import { fmtPeso } from "@/lib/format";
import { cn } from "@/lib/utils";

type TopEmployeesTableProps = {
  employees: SalesByEmployeeRow[];
  isLoading: boolean;
};

export function TopEmployeesTable({ employees, isLoading }: TopEmployeesTableProps) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-foreground">Top Employees</h2>
        <Link
          href="/reports/sales-by-employee"
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all &rarr;
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <TopEmployeesHeader className="w-8 px-5 text-left">#</TopEmployeesHeader>
              <TopEmployeesHeader align="left">Employee</TopEmployeesHeader>
              <TopEmployeesHeader>Sales</TopEmployeesHeader>
              <TopEmployeesHeader>Revenue</TopEmployeesHeader>
              <TopEmployeesHeader>Avg Ticket</TopEmployeesHeader>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  {Array.from({ length: 5 }).map((__, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-1.5">
                      <div className="h-4 animate-pulse rounded bg-muted/40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  No employee sales data for this period
                </td>
              </tr>
            ) : (
              employees.map((employee, index) => (
                <TopEmployeesRow
                  key={employee.employeeId || employee.employeeName || index}
                  employee={employee}
                  index={index}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopEmployeesHeader({
  align = "right",
  className,
  children,
}: {
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

function TopEmployeesRow({
  employee,
  index,
}: {
  employee: SalesByEmployeeRow;
  index: number;
}) {
  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/20">
      <td className="px-5 py-1.5 text-[12px] font-medium text-muted-foreground">{index + 1}</td>
      <td className="px-4 py-1.5">
        <div className="text-[12px] font-medium text-foreground">{employee.employeeName}</div>
        <div className="mt-px text-[10px] text-muted-foreground">{employee.employeeRole}</div>
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums text-foreground">
        {employee.totalSales.toLocaleString("en-PH")}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums text-foreground">
        {fmtPeso(employee.totalRevenue)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums text-foreground">
        {fmtPeso(employee.avgSaleValue)}
      </td>
    </tr>
  );
}
