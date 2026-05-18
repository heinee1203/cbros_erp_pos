"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";

import { useAuth } from "@/app/auth-context";
import { AiAdvisorPanel } from "@/components/ai-advisor-panel";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";
import {
  useStockMonitor,
  useStockMonitorRefresh,
  type StockMonitorFilters,
  type StockMonitorRow,
  type StockMonitorSummary,
} from "@/hooks/use-stock-monitor";
import { useSubcategories } from "@/hooks/use-subcategories";
import { cn } from "@/lib/utils";
import { EmptyState } from "./components/empty-state";
import { FilterSelect } from "./components/filter-select";
import { SortHeader } from "./components/sort-header";
import { StockMonitorTableRow } from "./components/stock-monitor-row";
import { SummaryCards } from "./components/summary-cards";
import { ALL_COLUMNS, API_BASE, DEFAULT_VISIBLE_COLS, VELOCITY_PILLS } from "./constants";
import type { SortDir, SortField, VelocityWindow } from "./types";

export default function StockMonitorPage() {
  const router = useRouter();
  const { token, apiLocationId, loading: authLoading } = useAuth();

  const [statusFilter, setStatusFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("stock-monitor-columns");
        if (saved) return new Set(JSON.parse(saved));
      } catch {}
    }
    return new Set(DEFAULT_VISIBLE_COLS);
  });
  const [showColPicker, setShowColPicker] = useState(false);

  const [velocityWindow, setVelocityWindow] = useState<VelocityWindow>("365");
  const [sortBy, setSortBy] = useState<SortField>("daysOfStock");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiProductIds, setAiProductIds] = useState<string[]>([]);
  const [aiProductNames, setAiProductNames] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<"single" | "multi" | "budget">("single");

  const isCol = (key: string) => visibleCols.has(key);

  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem("stock-monitor-columns", JSON.stringify([...next]));
      return next;
    });
  };

  const getVelocity = (row: StockMonitorRow): number => {
    switch (velocityWindow) {
      case "30":
        return parseFloat(row.avgDailySales30d) || 0;
      case "90":
        return parseFloat(row.avgDailySales90d) || 0;
      case "180":
        return parseFloat(row.avgDailySales180d) || 0;
      case "365":
        return parseFloat(row.avgDailySales365d) || 0;
      case "all":
        return parseFloat(row.avgDailySalesAll) || 0;
      default:
        return parseFloat(row.avgDailySales365d) || 0;
    }
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[1](setTimeout(() => setDebouncedSearch(value), 300));
  };

  const filters: StockMonitorFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    brandId: brandFilter !== "all" ? brandFilter : undefined,
    categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    subcategoryId: subcategoryFilter !== "all" ? subcategoryFilter : undefined,
    sortBy,
    sortDir,
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useStockMonitor(token, apiLocationId, filters);

  const refreshMutation = useStockMonitorRefresh(token, apiLocationId);
  const { data: brandsData } = useBrands(token, apiLocationId);
  const { data: categoriesData } = useCategories(token, apiLocationId);
  const { data: subcategoriesData } = useSubcategories(token, apiLocationId);

  const brands = brandsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const allSubcategories = subcategoriesData?.data ?? [];
  const filteredSubcategories = categoryFilter !== "all"
    ? allSubcategories.filter((subcategory: any) => subcategory.categoryId === categoryFilter)
    : allSubcategories;

  const rows = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.data) ?? [];
    const seen = new Set<string>();
    return all.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [data]);

  const summary: StockMonitorSummary | null = data?.pages[0]?.summary ?? null;
  const lastComputed = rows[0]?.computedAt ?? null;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    brandFilter !== "all" ||
    categoryFilter !== "all" ||
    searchQuery !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setBrandFilter("all");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setSearchQuery("");
    setDebouncedSearch("");
  };

  const handleExport = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.brandId) params.set("brandId", filters.brandId);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    const qs = params.toString();
    const url = `${API_BASE}/inventory/stock-monitor/export${qs ? `?${qs}` : ""}`;
    window.open(url, "_blank");
  }, [filters]);

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-background px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Activity size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Stock Monitor</h1>
              <p className="text-xs text-muted-foreground">
                Sales velocity, days of stock, and replenishment insights
                {lastComputed && (
                  <span className="ml-2 text-muted-foreground/60">
                    Last computed {new Date(lastComputed).toLocaleDateString()} {new Date(lastComputed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/procurement/stock-monitor/suppliers")}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Supplier Metrics
              <ArrowRight size={12} />
            </button>
            <button
              onClick={handleExport}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Download size={12} />
              Export CSV
            </button>
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {refreshMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              Refresh Metrics
            </button>
          </div>
        </div>
      </div>

      {summary && (
        <SummaryCards
          summary={summary}
          activeStatus={statusFilter}
          onStatusClick={(status) => setStatusFilter(statusFilter === status ? "all" : status)}
        />
      )}

      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "CRITICAL", label: "Critical" },
              { value: "LOW", label: "Low" },
              { value: "HEALTHY", label: "Healthy" },
              { value: "OVERSTOCK", label: "Overstock" },
              { value: "DEAD_STOCK", label: "Dead Stock" },
            ]}
          />

          <FilterSelect
            value={brandFilter}
            onChange={setBrandFilter}
            options={[
              { value: "all", label: "All Brands" },
              ...brands.map((brand) => ({ value: brand.id, label: brand.name })),
            ]}
          />

          <FilterSelect
            value={categoryFilter}
            onChange={(value) => {
              setCategoryFilter(value);
              setSubcategoryFilter("all");
            }}
            options={[
              { value: "all", label: "All Categories" },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
            ]}
          />

          <FilterSelect
            value={subcategoryFilter}
            onChange={setSubcategoryFilter}
            options={[
              { value: "all", label: "All Sub-categories" },
              ...filteredSubcategories.map((subcategory: any) => ({ value: subcategory.id, label: subcategory.name })),
            ]}
          />

          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search product, SKU..."
              className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowColPicker(!showColPicker)}
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings size={12} />
              Columns
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-background p-2 shadow-lg">
                {ALL_COLUMNS.map((column) => (
                  <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={visibleCols.has(column.key)}
                      onChange={() => toggleCol(column.key)}
                      className="rounded border-border"
                    />
                    {column.label}
                  </label>
                ))}
                <div className="mt-1 border-t border-border pt-1">
                  <button
                    onClick={() => {
                      setVisibleCols(new Set(DEFAULT_VISIBLE_COLS));
                      localStorage.setItem("stock-monitor-columns", JSON.stringify(DEFAULT_VISIBLE_COLS));
                    }}
                    className="w-full rounded px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <span className="mr-1 text-[11px] text-muted-foreground">Velocity:</span>
        {VELOCITY_PILLS.map((pill) => (
          <button
            key={pill.key}
            onClick={() => setVelocityWindow(pill.key)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              velocityWindow === pill.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load stock metrics</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
                <tr>
                  {isCol("status") && <SortHeader label="Status" field="status" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />}
                  {isCol("product") && <SortHeader label="Product" field="productName" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />}
                  {isCol("brand") && <SortHeader label="Brand" field="brandName" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />}
                  {isCol("category") && <SortHeader label="Category" field="categoryName" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />}
                  {isCol("subcategory") && <th scope="col" className="whitespace-nowrap px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sub-category</th>}
                  {isCol("totalStock") && <SortHeader label="Total Stock" field="totalStock" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {isCol("avgSales") && <SortHeader label="Avg Sales/Day" field="avgDailySales30d" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {isCol("daysOfStock") && <SortHeader label="Days of Stock" field="daysOfStock" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {isCol("lastSold") && <SortHeader label="Last Sold" field="lastSaleDate" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />}
                  {isCol("stockoutDays") && <SortHeader label="Stockout Days" field="stockoutDays90d" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {isCol("lastPo") && <SortHeader label="Last PO" field="lastPoDate" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />}
                  {isCol("leadTime") && <th scope="col" className="whitespace-nowrap px-4 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider">Lead Time</th>}
                  {isCol("ai") && <th scope="col" className="w-10 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider">AI</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <StockMonitorTableRow
                    key={row.id}
                    row={row}
                    visibleCols={visibleCols}
                    velocity={getVelocity(row)}
                    onClick={() => router.push(`/inventory/${row.productId}/edit`)}
                    onAskAi={() => {
                      setAiProductIds([row.productId]);
                      setAiProductNames([row.productName]);
                      setAiMode("single");
                      setAiPanelOpen(true);
                    }}
                  />
                ))}
              </tbody>
            </table>
            <div ref={sentinelRef} className="h-4" />
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length}
            {summary ? ` of ${summary.total.toLocaleString()}` : ""} item{rows.length !== 1 ? "s" : ""} loaded
            {hasActiveFilters ? " (filtered)" : ""}
            {hasNextPage ? " \u2014 more available" : ""}
          </span>
          <div className="flex items-center gap-3">
            {isFetchingNextPage && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Loading more...
              </span>
            )}
            <span className="flex items-center gap-1 rounded bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              GET /inventory/stock-monitor
            </span>
          </div>
        </div>
      </div>

      <AiAdvisorPanel
        open={aiPanelOpen}
        onClose={() => {
          setAiPanelOpen(false);
          setAiProductIds([]);
          setAiProductNames([]);
        }}
        productIds={aiProductIds}
        productNames={aiProductNames}
        mode={aiMode}
      />
    </div>
  );
}
