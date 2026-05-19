import { ChevronDown, ChevronUp, Trophy, UserCog } from "lucide-react";
import type { SalesByEmployeeRow } from "@/hooks/use-sales-reports";
import { cn } from "@/lib/utils";
import type { SalesByEmployeeController, SortField } from "../types";
import { fmtCurrency, fmtNumber, RANK_COLORS } from "../utils";

type SalesByEmployeeTableProps = {
  controller: SalesByEmployeeController;
};

export function SalesByEmployeeTable({ controller }: SalesByEmployeeTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
        <div className="w-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</div>
        <div className="w-40 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Employee</div>
        <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" />
        <SortHeader controller={controller} label="Sales" field="totalSales" width="w-20" />
        <SortHeader controller={controller} label="Revenue" field="totalRevenue" width="w-32" />
        <SortHeader controller={controller} label="Avg Sale" field="avgSaleValue" width="w-28" />
        <SortHeader controller={controller} label="Discounts" field="totalDiscounts" width="w-28" />
        <SortHeader controller={controller} label="Refunds" field="refundCount" width="w-20" />
      </div>

      {controller.isLoading ? (
        <div>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse border-b border-border bg-muted/20" />
          ))}
        </div>
      ) : controller.filtered.length === 0 ? (
        <SalesByEmployeeEmptyState search={controller.search} />
      ) : (
        <div className="divide-y divide-border">
          {controller.filtered.map((employee, index) => (
            <SalesByEmployeeRowView
              key={employee.employeeId ?? employee.employeeName}
              employee={employee}
              rank={index + 1}
              maxRevenue={controller.maxRevenue}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
        <span className="text-[11px] text-muted-foreground">{controller.filtered.length} employees</span>
        <span className="text-[11px] text-muted-foreground">Total revenue: {fmtCurrency(controller.totalRev)}</span>
      </div>
    </div>
  );
}

function SortHeader({
  controller,
  label,
  field,
  width,
  align = "right",
}: {
  controller: SalesByEmployeeController;
  label: string;
  field: SortField;
  width: string;
  align?: "left" | "right";
}) {
  const active = controller.sortBy === field;
  return (
    <button
      onClick={() => controller.handleSort(field)}
      className={cn(
        "flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
        width,
        align === "right" ? "justify-end" : "justify-start",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active && (controller.sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
    </button>
  );
}

function SalesByEmployeeRowView({
  employee,
  rank,
  maxRevenue,
}: {
  employee: SalesByEmployeeRow;
  rank: number;
  maxRevenue: number;
}) {
  const pct = (parseFloat(employee.totalRevenue) / maxRevenue) * 100;

  return (
    <div className="flex items-center px-4 py-3 transition-colors hover:bg-accent/40">
      <div className={cn("w-10 text-[13px] tabular-nums", RANK_COLORS[rank] ?? "text-muted-foreground")}>
        {rank <= 3 ? (
          <span className="flex items-center gap-0.5">
            <Trophy size={11} className={rank === 1 ? "text-amber-500" : rank === 2 ? "text-slate-400" : "text-amber-700"} />
            {rank}
          </span>
        ) : rank}
      </div>
      <div className="w-40 min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground">{employee.employeeName}</span>
      </div>
      <div className="flex-1 pr-4">
        <div className="h-4 w-full overflow-hidden rounded-r-md bg-muted/40">
          <div
            className="h-4 rounded-r-md transition-all"
            style={{
              background: "linear-gradient(90deg, #10B981, #059669)",
              minWidth: "4px",
              width: `${Math.max(pct, 1)}%`,
            }}
          />
        </div>
      </div>
      <div className="w-20 text-right text-[12px] font-medium tabular-nums text-foreground">{fmtNumber(employee.totalSales)}</div>
      <div className="w-32 text-right text-[12px] font-medium tabular-nums text-foreground">{fmtCurrency(employee.totalRevenue)}</div>
      <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">{fmtCurrency(employee.avgSaleValue)}</div>
      <div className="w-28 text-right text-[12px] tabular-nums text-amber-600">{fmtCurrency(employee.totalDiscounts)}</div>
      <div className="w-20 text-right text-[12px] tabular-nums">
        {employee.refundCount > 0 ? (
          <span className="font-medium text-red-500">{fmtNumber(employee.refundCount)}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </div>
    </div>
  );
}

function SalesByEmployeeEmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <UserCog size={16} className="text-muted-foreground" />
      </div>
      <p className="mt-3 text-[13px] font-medium text-foreground">{search ? "No matching employees" : "No sales data"}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {search ? "Try adjusting your search" : "No completed sales for the selected period"}
      </p>
    </div>
  );
}
