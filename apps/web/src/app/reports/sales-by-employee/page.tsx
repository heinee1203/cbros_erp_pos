"use client";

import { useState } from "react";
import { UserCog, DollarSign, Hash, Download } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSalesByEmployeeQuery, useSalesSummaryQuery, type ReportFilters } from "@/hooks/use-sales-reports";

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-purple-500/10 text-purple-600",
  MANAGER: "bg-blue-500/10 text-blue-600",
  CASHIER: "bg-emerald-500/10 text-emerald-600",
  WAREHOUSE_STAFF: "bg-slate-500/10 text-slate-600",
};

function fmt(v: string) {
  return parseFloat(v).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function getDatePreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (preset) {
    case "today": from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "week": from = new Date(now); from.setDate(from.getDate() - 7); break;
    case "month": from = new Date(now); from.setMonth(from.getMonth() - 1); break;
    case "30d": from = new Date(now); from.setDate(from.getDate() - 30); break;
    default: from = new Date(now); from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to };
}

export default function SalesByEmployeePage() {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const reportQuery = useSalesByEmployeeQuery(token, locationId, filters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, filters);
  const employees = reportQuery.data?.data ?? [];
  const summary = summaryQuery.data;

  function applyPreset(preset: string) {
    setActivePreset(preset);
    const { from, to } = getDatePreset(preset);
    setDateFrom(from.slice(0, 10));
    setDateTo(to.slice(0, 10));
  }

  function clearDates() { setDateFrom(""); setDateTo(""); setActivePreset(null); }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><UserCog size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales by Employee</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Per-employee sales metrics, discounts, and refund rates.</p>
        {summary && (
          <div className="mt-4 flex gap-5">
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><DollarSign size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-semibold tabular-nums text-foreground">PHP {fmt(summary.totalRevenue)}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Transactions</span>
              <span className="font-semibold tabular-nums text-foreground">{summary.totalTransactions}</span>
            </div>
          </div>
        )}
      </div>

      {/* Date Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {["today", "week", "month", "30d"].map((p) => (
          <button key={p} onClick={() => applyPreset(p)} className={cn("h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors", activePreset === p ? "border-primary/20 bg-primary/[0.04] text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Last 30 Days"}
          </button>
        ))}
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }} className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground outline-none" />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }} className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground outline-none" />
        {(dateFrom || dateTo) && <button onClick={clearDates} className="h-8 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>}
        {employees.length > 0 && (
          <button
            onClick={() =>
              downloadCSV(
                "sales-by-employee",
                ["Employee", "Role", "Total Sales", "Revenue", "Avg Sale", "Discounts", "Refunds"],
                employees.map((e) => [
                  e.employeeName,
                  e.employeeRole,
                  String(e.totalSales),
                  e.totalRevenue,
                  e.avgSaleValue,
                  e.totalDiscounts,
                  String(e.refundCount),
                ]),
              )
            }
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download size={12} />
            Export CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Employee</div>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Role</div>
          <div className="w-16 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sales</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Revenue</div>
          <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Avg Sale</div>
          <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Discounts</div>
          <div className="w-16 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Refunds</div>
        </div>

        {reportQuery.isLoading ? (
          <div>{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/20" />)}</div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><UserCog size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No sales data</p>
            <p className="mt-1 text-[12px] text-muted-foreground">No completed sales for the selected period</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {employees.map((emp) => (
              <div key={emp.employeeId} className="flex items-center px-4 py-3 transition-colors hover:bg-accent/40">
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground">{emp.employeeName}</span>
                </div>
                <div className="w-24">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", ROLE_STYLES[emp.employeeRole] ?? "bg-muted text-muted-foreground")}>
                    {emp.employeeRole}
                  </span>
                </div>
                <div className="w-16 text-right text-[12px] tabular-nums font-medium text-foreground">{emp.totalSales}</div>
                <div className="w-28 text-right text-[12px] tabular-nums font-medium text-foreground">PHP {fmt(emp.totalRevenue)}</div>
                <div className="w-24 text-right text-[12px] tabular-nums text-muted-foreground">PHP {fmt(emp.avgSaleValue)}</div>
                <div className="w-24 text-right text-[12px] tabular-nums text-destructive">PHP {fmt(emp.totalDiscounts)}</div>
                <div className="w-16 text-right">
                  {emp.refundCount > 0 ? (
                    <span className="inline-flex rounded-md bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600">{emp.refundCount}</span>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">0</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{employees.length} employees</span>
        </div>
      </div>
    </div>
  );
}
