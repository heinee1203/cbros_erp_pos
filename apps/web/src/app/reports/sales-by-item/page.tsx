"use client";

import { useState, useMemo } from "react";
import { Package, DollarSign, Hash, TrendingUp, Download, Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSalesByItemQuery, useSalesSummaryQuery, type ReportFilters, type SalesByItemRow } from "@/hooks/use-sales-reports";

function fmt(v: string | number) {
  return parseFloat(String(v)).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

type SortField = "unitsSold" | "totalRevenue" | "totalCost" | "grossProfit" | "marginPct";
type SortDir = "asc" | "desc";

export default function SalesByItemPage() {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  // Sort
  const [sortBy, setSortBy] = useState<SortField>("totalRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const reportQuery = useSalesByItemQuery(token, locationId, filters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, filters);
  const rawItems = reportQuery.data?.data ?? [];
  const summary = summaryQuery.data;

  // Extract unique categories and brands for dropdowns
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of rawItems) {
      if (item.categoryName) set.add(item.categoryName);
    }
    return [...set].sort();
  }, [rawItems]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const item of rawItems) {
      // Brand might be embedded in the product name prefix or category — extract from category for now
      // Since SalesByItemRow doesn't have a brand field, we skip brand filtering unless the API returns it
    }
    return [...set].sort();
  }, [rawItems]);

  // Client-side filter + sort + paginate
  const filtered = useMemo(() => {
    let result = rawItems;

    // Search
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter((item) =>
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.mnemonicSku && item.mnemonicSku.toLowerCase().includes(q))
      );
    }

    // Category
    if (categoryFilter) {
      result = result.filter((item) => item.categoryName === categoryFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case "unitsSold": va = a.unitsSold; vb = b.unitsSold; break;
        case "totalRevenue": va = parseFloat(a.totalRevenue); vb = parseFloat(b.totalRevenue); break;
        case "totalCost": va = parseFloat(a.totalCost); vb = parseFloat(b.totalCost); break;
        case "grossProfit": va = parseFloat(a.grossProfit); vb = parseFloat(b.grossProfit); break;
        case "marginPct": va = parseFloat(a.marginPct); vb = parseFloat(b.marginPct); break;
        default: va = parseFloat(a.totalRevenue); vb = parseFloat(b.totalRevenue);
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });

    return result;
  }, [rawItems, search, categoryFilter, sortBy, sortDir]);

  // Unique items count for KPI
  const uniqueItemCount = filtered.length;

  // Pagination
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Reset page when filters change
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleCategory = (v: string) => { setCategoryFilter(v); setPage(1); };
  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setDateFrom("");
    setDateTo("");
    setSortBy("totalRevenue");
    setSortDir("desc");
    setPage(1);
  };

  const hasActiveFilters = search || categoryFilter || dateFrom || dateTo;

  const isLoading = reportQuery.isLoading;

  function SortHeader({ label, field, width }: { label: string; field: SortField; width: string }) {
    const active = sortBy === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={cn("flex items-center justify-end gap-0.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors", width,
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Package size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales by Item</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Item-level sales breakdown with revenue, cost, and margin analysis.</p>

        {/* KPI cards */}
        {summary && (
          <div className="mt-4 flex flex-wrap gap-5">
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><DollarSign size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-semibold tabular-nums text-foreground">{"\u20B1"}{fmt(summary.totalRevenue)}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Transactions</span>
              <span className="font-semibold tabular-nums text-foreground">{Number(summary.totalTransactions).toLocaleString()}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><TrendingUp size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Avg Sale</span>
              <span className="font-semibold tabular-nums text-foreground">{"\u20B1"}{fmt(summary.avgTransactionValue)}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Package size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Items Sold</span>
              <span className="font-semibold tabular-nums text-foreground">{uniqueItemCount.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters bar */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name, SKU, or barcode..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            {search && (
              <button onClick={() => handleSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category */}
          <select
            value={categoryFilter}
            onChange={(e) => handleCategory(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium text-foreground outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Date range */}
          <DateRangePicker
            startDate={dateFrom}
            endDate={dateTo}
            onChange={(start, end) => { setDateFrom(start); setDateTo(end); setPage(1); }}
          />

          {/* Reset */}
          {hasActiveFilters && (
            <button onClick={resetFilters} className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              Reset
            </button>
          )}

          {/* Export */}
          {filtered.length > 0 && (
            <button
              onClick={() =>
                downloadCSV(
                  "sales-by-item",
                  ["Item", "SKU", "Category", "Units Sold", "Revenue", "Cost", "Profit", "Margin %"],
                  filtered.map((item) => [
                    item.productName,
                    item.sku,
                    item.categoryName ?? "Uncategorized",
                    String(item.unitsSold),
                    item.totalRevenue,
                    item.totalCost,
                    item.grossProfit,
                    `${item.marginPct}%`,
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
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        {/* Header */}
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-8 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</div>
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Item</div>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Category</div>
          <SortHeader label="Units" field="unitsSold" width="w-16" />
          <SortHeader label="Revenue" field="totalRevenue" width="w-28" />
          <SortHeader label="Cost" field="totalCost" width="w-28" />
          <SortHeader label="Profit" field="grossProfit" width="w-28" />
          <SortHeader label="Margin" field="marginPct" width="w-16" />
        </div>

        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-12 animate-pulse border-b border-border bg-muted/20" />)}
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Package size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">{search || categoryFilter ? "No matching items" : "No sales data"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{search || categoryFilter ? "Try adjusting your filters" : "No completed sales found for the selected period"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {paginated.map((item, i) => {
              const profit = parseFloat(item.grossProfit);
              return (
                <div key={item.productId + i} className="flex items-center px-4 py-1.5 transition-colors hover:bg-accent/40">
                  <div className="w-8 text-[11px] tabular-nums text-muted-foreground">{(page - 1) * perPage + i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-foreground truncate">{item.productName}</div>
                    <span className="font-mono text-[10px] text-muted-foreground">{item.sku}</span>
                  </div>
                  <div className="w-24">
                    <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                      {item.categoryName ?? "Uncategorized"}
                    </span>
                  </div>
                  <div className="w-16 text-right text-[12px] tabular-nums text-foreground">{item.unitsSold.toLocaleString()}</div>
                  <div className="w-28 text-right text-[12px] tabular-nums font-medium text-foreground">{"\u20B1"}{fmt(item.totalRevenue)}</div>
                  <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">{"\u20B1"}{fmt(item.totalCost)}</div>
                  <div className={cn("w-28 text-right text-[12px] tabular-nums font-medium", profit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {"\u20B1"}{fmt(item.grossProfit)}
                  </div>
                  <div className="w-16 text-right text-[12px] tabular-nums font-semibold text-foreground">{item.marginPct}%</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer — pagination */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">
            Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}\u2013{Math.min(page * perPage, filtered.length)} of {filtered.length.toLocaleString()} items
          </span>
          <div className="flex items-center gap-2">
            <select
              value={perPage}
              onChange={(e) => { setPerPage(parseInt(e.target.value)); setPage(1); }}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>All</option>
            </select>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-[11px] tabular-nums text-muted-foreground">{page} / {totalPages || 1}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
