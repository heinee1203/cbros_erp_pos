"use client";

import { useState, useMemo } from "react";
import { Grid3x3, DollarSign, Hash, TrendingUp, Percent, Download, Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSalesByCategoryQuery, useSalesSummaryQuery, type ReportFilters } from "@/hooks/use-sales-reports";
import Link from "next/link";

/* ── Formatters ── */
function fmtCurrency(v: string | number) {
  return "\u20B1" + parseFloat(String(v)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNumber(v: number) {
  return v.toLocaleString("en-PH");
}

/* ── Non-Items exclusion ── */
const EXCLUDED_CATEGORIES = new Set(["count", "price add", "payment", "labor"]);

type SortField = "categoryName" | "unitsSold" | "totalRevenue" | "grossProfit" | "marginPct" | "uniqueProducts";
type SortDir = "asc" | "desc";

export default function SalesByCategoryPage() {
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

  const reportQuery = useSalesByCategoryQuery(token, locationId, filters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, filters);
  const rawCategories = reportQuery.data?.data ?? [];
  const summary = summaryQuery.data;

  /* ── Filter + Sort ── */
  const filtered = useMemo(() => {
    let result = rawCategories.filter((cat: any) => {
      const name = (cat.categoryName ?? cat.category ?? "").toLowerCase();
      if (EXCLUDED_CATEGORIES.has(name)) return false;
      return true;
    });

    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter((cat: any) => {
        const name = (cat.categoryName ?? cat.category ?? "").toLowerCase();
        return name.includes(q);
      });
    }

    result = [...result].sort((a: any, b: any) => {
      let va: number | string, vb: number | string;
      switch (sortBy) {
        case "categoryName": va = (a.categoryName ?? a.category ?? "").toLowerCase(); vb = (b.categoryName ?? b.category ?? "").toLowerCase(); return sortDir === "asc" ? (va < vb ? -1 : 1) : (vb < va ? -1 : 1);
        case "unitsSold": va = a.unitsSold; vb = b.unitsSold; break;
        case "totalRevenue": va = parseFloat(a.totalRevenue); vb = parseFloat(b.totalRevenue); break;
        case "grossProfit": va = parseFloat(a.grossProfit); vb = parseFloat(b.grossProfit); break;
        case "marginPct": va = parseFloat(a.marginPct); vb = parseFloat(b.marginPct); break;
        case "uniqueProducts": va = a.uniqueProducts; vb = b.uniqueProducts; break;
        default: va = parseFloat(a.totalRevenue); vb = parseFloat(b.totalRevenue);
      }
      return sortDir === "desc" ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });

    return result;
  }, [rawCategories, search, sortBy, sortDir]);

  const maxRevenue = Math.max(...filtered.map((c: any) => parseFloat(c.totalRevenue)), 1);

  /* ── Derived KPIs ── */
  const totalProfit = filtered.reduce((s: number, c: any) => s + parseFloat(c.grossProfit), 0);
  const totalRevenue = filtered.reduce((s: number, c: any) => s + parseFloat(c.totalRevenue), 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir(field === "categoryName" ? "asc" : "desc"); }
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Grid3x3 size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales by Category</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Category-level performance with revenue, margin, and product coverage.</p>

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
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Percent size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Avg Margin</span>
              <span className="font-semibold tabular-nums text-foreground">{avgMargin.toFixed(1)}%</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Grid3x3 size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Categories</span>
              <span className="font-semibold tabular-nums text-foreground">{filtered.length}</span>
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
              placeholder="Search categories..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
          {hasFilters && <button onClick={resetFilters} className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Reset</button>}
          {filtered.length > 0 && (
            <button
              onClick={() => downloadCSV("sales-by-category",
                ["Category", "Units Sold", "Revenue", "Profit", "Margin %", "SKUs"],
                filtered.map((c: any) => [
                  c.categoryName ?? c.category ?? "Uncategorized",
                  String(c.unitsSold),
                  String(parseFloat(c.totalRevenue).toFixed(2)),
                  String(parseFloat(c.grossProfit).toFixed(2)),
                  `${c.marginPct}%`,
                  String(c.uniqueProducts),
                ]),
              )}
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
          <SortHeader label="Category" field="categoryName" width="w-36" align="left" />
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" />
          <SortHeader label="Units" field="unitsSold" width="w-20" />
          <SortHeader label="Revenue" field="totalRevenue" width="w-32" />
          <SortHeader label="Profit" field="grossProfit" width="w-32" />
          <SortHeader label="Margin" field="marginPct" width="w-16" />
          <SortHeader label="SKUs" field="uniqueProducts" width="w-16" />
        </div>

        {reportQuery.isLoading ? (
          <div>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/20" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Grid3x3 size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">{search ? "No matching categories" : "No sales data"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{search ? "Try adjusting your search" : "No completed sales for the selected period"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((cat: any) => {
              const pct = (parseFloat(cat.totalRevenue) / maxRevenue) * 100;
              const profit = parseFloat(cat.grossProfit);
              const catName = cat.categoryName ?? cat.category?.replace("_", " ") ?? "Uncategorized";
              return (
                <div key={catName} className="flex items-center px-4 py-3 transition-colors hover:bg-accent/40">
                  <div className="w-36">
                    <Link
                      href={`/reports/sales-by-item?category=${encodeURIComponent(catName)}`}
                      className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground hover:text-emerald-600 hover:underline transition-colors"
                    >
                      {catName}
                    </Link>
                  </div>
                  <div className="flex-1 pr-4">
                    <div className="h-5 w-full rounded-r-md bg-muted/40 overflow-hidden">
                      <div
                        className="h-5 rounded-r-md transition-all"
                        style={{ width: `${Math.max(pct, 1)}%`, background: "linear-gradient(90deg, #10B981, #059669)" }}
                      />
                    </div>
                  </div>
                  <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{fmtNumber(cat.unitsSold)}</div>
                  <div className="w-32 text-right text-[12px] tabular-nums font-medium text-foreground">{fmtCurrency(cat.totalRevenue)}</div>
                  <div className={cn("w-32 text-right text-[12px] tabular-nums font-medium", profit >= 0 ? "text-emerald-600" : "text-red-500")}>{fmtCurrency(cat.grossProfit)}</div>
                  <div className="w-16 text-right text-[12px] tabular-nums font-semibold text-foreground">{cat.marginPct}%</div>
                  <div className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">{fmtNumber(cat.uniqueProducts)}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{filtered.length} categories</span>
        </div>
      </div>
    </div>
  );
}
