"use client";

import { useState, useMemo } from "react";
import { UserCog, DollarSign, Hash, Users, TrendingUp, Download, Search, X, ChevronUp, ChevronDown, Trophy } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSalesByEmployeeQuery, useSalesSummaryQuery, type ReportFilters } from "@/hooks/use-sales-reports";

/* ── Formatters ── */
function fmtCurrency(v: string | number) {
  return "\u20B1" + parseFloat(String(v)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNumber(v: number | string) {
  return Number(v).toLocaleString("en-PH");
}

/* ── Rank colours for top 3 ── */
const RANK_COLORS: Record<number, string> = {
  1: "text-amber-500 font-bold",   // gold
  2: "text-slate-400 font-bold",   // silver
  3: "text-amber-700 font-bold",   // bronze
};

type SortField = "totalSales" | "totalRevenue" | "avgSaleValue" | "totalDiscounts" | "refundCount";
type SortDir = "asc" | "desc";

export default function SalesByEmployeePage() {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("totalRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const reportQuery = useSalesByEmployeeQuery(token, locationId, filters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, filters);
  const rawEmployees = reportQuery.data?.data ?? [];
  const summary = summaryQuery.data;

  /* ── Search + Sort ── */
  const filtered = useMemo(() => {
    let result = [...rawEmployees];

    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter((emp) => emp.employeeName.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case "totalSales": va = a.totalSales; vb = b.totalSales; break;
        case "totalRevenue": va = parseFloat(a.totalRevenue); vb = parseFloat(b.totalRevenue); break;
        case "avgSaleValue": va = parseFloat(a.avgSaleValue); vb = parseFloat(b.avgSaleValue); break;
        case "totalDiscounts": va = parseFloat(a.totalDiscounts); vb = parseFloat(b.totalDiscounts); break;
        case "refundCount": va = a.refundCount; vb = b.refundCount; break;
        default: va = parseFloat(a.totalRevenue); vb = parseFloat(b.totalRevenue);
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });

    return result;
  }, [rawEmployees, search, sortBy, sortDir]);

  const maxRevenue = Math.max(...filtered.map((e) => parseFloat(e.totalRevenue)), 1);

  /* ── Derived KPIs ── */
  const totalRev = filtered.reduce((s, e) => s + parseFloat(e.totalRevenue), 0);
  const totalDisc = filtered.reduce((s, e) => s + parseFloat(e.totalDiscounts), 0);
  const avgPerEmployee = filtered.length > 0 ? totalRev / filtered.length : 0;

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  const hasFilters = search || dateFrom || dateTo;
  const resetFilters = () => { setSearch(""); setDateFrom(""); setDateTo(""); setSortBy("totalRevenue"); setSortDir("desc"); };

  function SortHeader({ label, field, width, align = "right" }: { label: string; field: SortField; width: string; align?: "left" | "right" }) {
    const active = sortBy === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={cn("flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors", width,
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
      >
        {label}
        {active && (sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
      </button>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><UserCog size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales by Employee</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Per-employee sales metrics, discounts, and refund rates.</p>

        {/* KPI cards */}
        {summary && (
          <div className="mt-4 flex flex-wrap gap-5">
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><DollarSign size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-semibold tabular-nums text-foreground">{fmtCurrency(summary.totalRevenue)}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Transactions</span>
              <span className="font-semibold tabular-nums text-foreground">{Number(summary.totalTransactions).toLocaleString()}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Users size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Employees</span>
              <span className="font-semibold tabular-nums text-foreground">{filtered.length}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><TrendingUp size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Avg / Employee</span>
              <span className="font-semibold tabular-nums text-foreground">{fmtCurrency(avgPerEmployee)}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><DollarSign size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Total Discounts</span>
              <span className="font-semibold tabular-nums text-amber-600">{fmtCurrency(summary.totalDiscounts)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
          {hasFilters && <button onClick={resetFilters} className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Reset</button>}
          {filtered.length > 0 && (
            <button
              onClick={() =>
                downloadCSV(
                  "sales-by-employee",
                  ["Rank", "Employee", "Sales", "Revenue", "Avg Sale", "Discounts", "Refunds"],
                  filtered.map((e, i) => [
                    String(i + 1),
                    e.employeeName,
                    String(e.totalSales),
                    String(parseFloat(e.totalRevenue).toFixed(2)),
                    String(parseFloat(e.avgSaleValue).toFixed(2)),
                    String(parseFloat(e.totalDiscounts).toFixed(2)),
                    String(e.refundCount),
                  ]),
                )
              }
              className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</div>
          <div className="w-40 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Employee</div>
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" />
          <SortHeader label="Sales" field="totalSales" width="w-20" />
          <SortHeader label="Revenue" field="totalRevenue" width="w-32" />
          <SortHeader label="Avg Sale" field="avgSaleValue" width="w-28" />
          <SortHeader label="Discounts" field="totalDiscounts" width="w-28" />
          <SortHeader label="Refunds" field="refundCount" width="w-20" />
        </div>

        {reportQuery.isLoading ? (
          <div>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/20" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><UserCog size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">{search ? "No matching employees" : "No sales data"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{search ? "Try adjusting your search" : "No completed sales for the selected period"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((emp, idx) => {
              const rank = idx + 1;
              const pct = (parseFloat(emp.totalRevenue) / maxRevenue) * 100;
              return (
                <div key={emp.employeeId ?? emp.employeeName} className="flex items-center px-4 py-3 transition-colors hover:bg-accent/40">
                  {/* Rank */}
                  <div className={cn("w-10 text-[13px] tabular-nums", RANK_COLORS[rank] ?? "text-muted-foreground")}>
                    {rank <= 3 ? (
                      <span className="flex items-center gap-0.5">
                        <Trophy size={11} className={rank === 1 ? "text-amber-500" : rank === 2 ? "text-slate-400" : "text-amber-700"} />
                        {rank}
                      </span>
                    ) : rank}
                  </div>
                  {/* Employee name */}
                  <div className="w-40 min-w-0">
                    <span className="text-[13px] font-medium text-foreground truncate block">{emp.employeeName}</span>
                  </div>
                  {/* Revenue bar */}
                  <div className="flex-1 pr-4">
                    <div className="h-4 w-full rounded-r-md bg-muted/40 overflow-hidden">
                      <div
                        className="h-4 rounded-r-md transition-all"
                        style={{ width: `${Math.max(pct, 1)}%`, background: "linear-gradient(90deg, #10B981, #059669)", minWidth: "4px" }}
                      />
                    </div>
                  </div>
                  {/* Sales count */}
                  <div className="w-20 text-right text-[12px] tabular-nums font-medium text-foreground">{fmtNumber(emp.totalSales)}</div>
                  {/* Revenue */}
                  <div className="w-32 text-right text-[12px] tabular-nums font-medium text-foreground">{fmtCurrency(emp.totalRevenue)}</div>
                  {/* Avg Sale */}
                  <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">{fmtCurrency(emp.avgSaleValue)}</div>
                  {/* Discounts — amber/neutral, NOT green */}
                  <div className="w-28 text-right text-[12px] tabular-nums text-amber-600">{fmtCurrency(emp.totalDiscounts)}</div>
                  {/* Refunds — consistent column */}
                  <div className="w-20 text-right text-[12px] tabular-nums">
                    {emp.refundCount > 0 ? (
                      <span className="text-red-500 font-medium">{fmtNumber(emp.refundCount)}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{filtered.length} employees</span>
        </div>
      </div>
    </div>
  );
}
