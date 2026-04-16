"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Search,
  RefreshCw,
  Loader2,
  TrendingUp,
  ShoppingCart,
  Shield,
  AlertTriangle,
  XCircle,
  Package,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useStockMonitor,
  useStockMonitorRefresh,
  type StockMonitorRow,
  type StockMonitorSummary,
  type StockMonitorFilters,
} from "@/hooks/use-stock-monitor";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { ReorderSuggestionsPanel } from "./reorder-panel";
import { useProductFamilies } from "@/hooks/use-products";

// ── Constants ──

const VELOCITY_CLASSES = [
  { key: "FAST_MOVER", label: "Fast Movers", badge: "bg-green-100 text-green-700", icon: TrendingUp, summaryKey: "fastMovers" as const },
  { key: "STRATEGIC_STOCK", label: "Strategic", badge: "bg-blue-100 text-blue-700", icon: Shield, summaryKey: "strategicStock" as const },
  { key: "WATCH_LIST", label: "Watch List", badge: "bg-amber-100 text-amber-700", icon: AlertTriangle, summaryKey: "watchList" as const },
  { key: "DEAD_STOCK", label: "Dead Stock", badge: "bg-red-100 text-red-700", icon: XCircle, summaryKey: "deadStockVelocity" as const },
  { key: "NEW_ITEM", label: "New Item", badge: "bg-gray-100 text-gray-600", icon: Package, summaryKey: "newItems" as const },
];

function fmtPeso(v: number): string {
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type SortField = "productName" | "totalStock" | "avgDailySales30d" | "daysOfStock" | "saleDaysCount" | "daysSinceLastSale" | "totalQtySold";
type SortDir = "asc" | "desc";

// ── Page ──

export default function StockVelocityPage() {
  const { token, locationId, apiLocationId } = useAuth();
  const router = useRouter();

  const [velocityFilter, setVelocityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("daysOfStock");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<"classification" | "velocity" | "reorder">("classification");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [urgencyWindow, setUrgencyWindow] = useState("");
  // Per-window LEFT column urgency filters (server-side)
  const [leftFilterAll, setLeftFilterAll] = useState("");
  const [leftFilter12m, setLeftFilter12m] = useState("");
  const [leftFilter6m, setLeftFilter6m] = useState("");
  const [leftFilter3m, setLeftFilter3m] = useState("");
  const [leftFilter1m, setLeftFilter1m] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [reorderPanelOpen, setReorderPanelOpen] = useState(false);
  const [lastSoldAfter, setLastSoldAfter] = useState("");
  const [lastSoldBefore, setLastSoldBefore] = useState("");
  const [hideNegativeStock, setHideNegativeStock] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("stockVelocity.hideNegativeStock") !== "false";
    }
    return true;
  });
  const [hideDC, setHideDC] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("stockVelocity.hideDC") !== "false";
    return true;
  });
  const [hideSO, setHideSO] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("stockVelocity.hideSO") !== "false";
    return true;
  });

  const debounceTimer = useMemo(() => ({ id: null as any }), []);
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceTimer.id);
    debounceTimer.id = setTimeout(() => setDebouncedSearch(value), 300);
  }, [debounceTimer]);

  // Filter option data
  const { data: brandsData } = useBrands(token, apiLocationId);
  const { data: categoriesData } = useCategories(token, apiLocationId);
  const { data: subcategoriesData } = useSubcategories(token, apiLocationId);
  const { data: familiesData } = useProductFamilies(token, apiLocationId);
  const brands = brandsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const allSubcategories = subcategoriesData?.data ?? [];
  const families = familiesData?.data ?? [];
  const filteredSubcategories = categoryFilter
    ? allSubcategories.filter((s: any) => s.categoryId === categoryFilter)
    : allSubcategories;

  // Build filters — velocity class filter is now server-side
  const filters: StockMonitorFilters = {
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
    categoryId: categoryFilter || undefined,
    subcategoryId: subcategoryFilter || undefined,
    brandId: brandFilter || undefined,
    familyId: familyFilter || undefined,
    hideNegativeStock: hideNegativeStock || undefined,
    hideDiscontinued: hideDC || undefined,
    hideSpecialOrder: hideSO || undefined,
    urgency: urgencyFilter || undefined,
    urgencyWindow: urgencyWindow || undefined,
    velocityClass: velocityFilter && velocityFilter !== "all" ? velocityFilter : undefined,
    urgencyAll: leftFilterAll || undefined,
    urgency12m: leftFilter12m || undefined,
    urgency6m: leftFilter6m || undefined,
    urgency3m: leftFilter3m || undefined,
    urgency1m: leftFilter1m || undefined,
    lastSoldAfter: lastSoldAfter || undefined,
    lastSoldBefore: lastSoldBefore || undefined,
  };

  const {
    data: monitorPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = useStockMonitor(token, apiLocationId, filters, 100);

  const refreshMutation = useStockMonitorRefresh(token, apiLocationId);

  const allRows = useMemo(() => {
    return monitorPages?.pages?.flatMap((p) => p.data) ?? [];
  }, [monitorPages]);

  const summary = monitorPages?.pages?.[0]?.summary;

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(field === "productName" ? "asc" : "desc");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Activity size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Stock Velocity</h1>
            <p className="text-xs text-muted-foreground">
              Demand frequency × days-of-stock classification
              {summary && <span className="ml-2 text-muted-foreground/60">Last computed: {(() => {
                const ts = summary.computedAt || allRows[0]?.computedAt;
                if (!ts) return "Never";
                const d = new Date(ts);
                return isNaN(d.getTime()) ? "Unknown" : d.toLocaleString("en-PH");
              })()}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={() => refreshMutation.mutateAsync(undefined)}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw size={13} className={cn(refreshMutation.isPending && "animate-spin")} />
          {refreshMutation.isPending ? "Computing..." : "Recompute"}
        </button>
        <button
          onClick={() => setViewMode("reorder")}
          className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium", viewMode === "reorder" ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          <ShoppingCart size={13} />
          Reorder Suggestions
        </button>
      </div>

      {/* Summary Cards — visible on ALL tabs for context */}
      {summary && (
        <div className="mb-4 flex flex-wrap gap-2">
          {VELOCITY_CLASSES.map((vc) => {
            const count = summary[vc.summaryKey] ?? 0;
            const pct = summary.total > 0 ? ((count / summary.total) * 100).toFixed(1) : "0";
            const isActive = velocityFilter === vc.key;
            return (
              <button
                key={vc.key}
                onClick={() => setVelocityFilter(isActive ? "all" : vc.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                  isActive ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-background hover:bg-muted",
                )}
              >
                <vc.icon size={14} className={cn(isActive ? "text-primary" : "text-muted-foreground")} />
                <span className="font-semibold">{count.toLocaleString()}</span>
                <span className="text-muted-foreground">{vc.label}</span>
                <span className="text-muted-foreground/60">({pct}%)</span>
              </button>
            );
          })}
          {/* Dead Stock Value card */}
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
            <XCircle size={14} className="text-destructive" />
            <span className="text-muted-foreground">Dead Stock Value:</span>
            <span className="font-semibold text-destructive">{fmtPeso(summary.deadStockValue)}</span>
          </div>
        </div>
      )}

      {/* Filters — visible on ALL tabs */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={familyFilter} onChange={(e) => { setFamilyFilter(e.target.value); setCategoryFilter(""); setSubcategoryFilter(""); }} className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none">
          <option value="">All Families</option>
          {families.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setSubcategoryFilter(""); }} className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none">
          <option value="">All Categories</option>
          {(familyFilter ? categories.filter((c: any) => c.familyId === familyFilter) : categories).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={subcategoryFilter} onChange={(e) => setSubcategoryFilter(e.target.value)} className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none">
          <option value="">All Sub-categories</option>
          {filteredSubcategories.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none">
          <option value="">All Brands</option>
          {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {(familyFilter || categoryFilter || subcategoryFilter || brandFilter) && (
          <button onClick={() => { setFamilyFilter(""); setCategoryFilter(""); setSubcategoryFilter(""); setBrandFilter(""); }} className="text-[11px] text-primary hover:underline">Clear filters</button>
        )}
      </div>

      {/* Search + Tab Toggle row */}
      <div className="mb-3 flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search product, SKU..."
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
        {velocityFilter !== "all" && (
          <button onClick={() => setVelocityFilter("all")} className="text-xs text-primary hover:underline whitespace-nowrap">
            Clear class filter
          </button>
        )}
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
          {(["classification", "velocity", "reorder"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setViewMode(tab)}
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap",
                viewMode === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{tab === "classification" ? "Classification" : tab === "velocity" ? "Velocity Analysis" : "Reorder"}</span>
              <span className="block text-[8px] font-normal text-muted-foreground mt-0.5">
                {tab === "classification" ? "Stock levels & demand rates" : tab === "velocity" ? "Multi-window trend heatmap" : "Restock suggestions"}
              </span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideNegativeStock}
            onChange={(e) => {
              setHideNegativeStock(e.target.checked);
              localStorage.setItem("stockVelocity.hideNegativeStock", String(e.target.checked));
            }}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          <span className="text-[11px] text-muted-foreground">Hide negative stock</span>
        </label>
        <button onClick={() => { setHideDC(!hideDC); localStorage.setItem("stockVelocity.hideDC", String(!hideDC)); }}
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${hideDC ? "bg-gray-200 text-gray-700" : "bg-background border border-border text-muted-foreground hover:bg-muted"}`}>
          {hideDC ? "Discontinued Hidden" : "Show Discontinued"}
        </button>
        <button onClick={() => { setHideSO(!hideSO); localStorage.setItem("stockVelocity.hideSO", String(!hideSO)); }}
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${hideSO ? "bg-blue-100 text-blue-700" : "bg-background border border-border text-muted-foreground hover:bg-muted"}`}>
          {hideSO ? "Special Order Hidden" : "Show Special Order"}
        </button>
        {/* Urgency filter — only for Classification view (Velocity Analysis uses per-window filters in the table header) */}
        {viewMode === "classification" && (
          <>
            <select
              value={urgencyFilter}
              onChange={(e) => { setUrgencyFilter(e.target.value); if (!e.target.value) setUrgencyWindow(""); }}
              className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
            >
              <option value="">All Urgency</option>
              <option value="critical">🟤 Critical (&lt; 0.5 mo)</option>
              <option value="warning">🟡 Warning (&lt; 1.5 mo)</option>
              <option value="monitor">🟠 Monitor (&lt; 3 mo)</option>
            </select>
            {urgencyFilter && (
              <select
                value={urgencyWindow}
                onChange={(e) => setUrgencyWindow(e.target.value)}
                className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
              >
                <option value="">All Windows</option>
                <option value="12m">12M Rate</option>
                <option value="6m">6M Rate</option>
                <option value="3m">3M Rate</option>
                <option value="1m">1M Rate</option>
              </select>
            )}
          </>
        )}

        {/* Last Sold date filter */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">Last sold:</span>
          <DateRangePicker
            startDate={lastSoldAfter}
            endDate={lastSoldBefore}
            onChange={(start, end) => { setLastSoldAfter(start); setLastSoldBefore(end); }}
          />
        </div>
      </div>

      {/* Classification Table */}
      {viewMode === "classification" && (
        <div className="flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr>
                <SortTh label="CLASS" />
                <SortTh label="PRODUCT" field="productName" current={sortBy} dir={sortDir} onSort={handleSort} />
                <SortTh label="STOCK" field="totalStock" current={sortBy} dir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="AVG PRICE" align="right" />
                <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Suggested retail price based on cost + inflation + velocity markup. Red = selling below suggested. Green = healthy margin.">SUGG. PRICE</th>
                <SortTh label="DEMAND" field="avgDailySales30d" current={sortBy} dir={sortDir} onSort={handleSort} align="right" tooltip={DEMAND_TOOLTIP} />
                <SortTh label="DOS" field="daysOfStock" current={sortBy} dir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="ACTIVE" field="saleDaysCount" current={sortBy} dir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="TOTAL SOLD" field="totalQtySold" current={sortBy} dir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="LAST SALE" field="daysSinceLastSale" current={sortBy} dir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {allRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    {velocityFilter !== "all" ? "No items in this class" : "No velocity data — click Recompute"}
                  </td>
                </tr>
              ) : (
                allRows.map((row, idx) => <VelocityRow key={`${row.id}-${idx}`} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Velocity Analysis Table (Heatmap) */}
      {viewMode === "velocity" && (
        <VelocityAnalysisTable
          rows={allRows} sortBy={sortBy} sortDir={sortDir} onSort={(f) => handleSort(f as SortField)}
          leftFilters={{ all: leftFilterAll, m12: leftFilter12m, m6: leftFilter6m, m3: leftFilter3m, m1: leftFilter1m }}
          onLeftFilterChange={(window, val) => {
            if (window === "all") setLeftFilterAll(val);
            else if (window === "12m") setLeftFilter12m(val);
            else if (window === "6m") setLeftFilter6m(val);
            else if (window === "3m") setLeftFilter3m(val);
            else if (window === "1m") setLeftFilter1m(val);
          }}
          onClearLeftFilters={() => { setLeftFilterAll(""); setLeftFilter12m(""); setLeftFilter6m(""); setLeftFilter3m(""); setLeftFilter1m(""); }}
          totalCount={monitorPages?.pages?.[0]?.summary?.total ?? 0}
        />
      )}

      {/* Load more + Footer — only for Classification/Velocity tabs */}
      {viewMode !== "reorder" && (
        <>
          {hasNextPage && (
            <div className="mt-2 text-center">
              <button onClick={() => fetchNextPage()} className="text-xs text-primary hover:underline">
                Load more
              </button>
            </div>
          )}
          <div className="mt-2 text-[10px] text-muted-foreground">
            Showing {allRows.length} items{velocityFilter !== "all" ? ` (filtered: ${VELOCITY_CLASSES.find(v => v.key === velocityFilter)?.label})` : ""}
            {summary ? ` of ${summary.total.toLocaleString()} total` : ""}
          </div>
        </>
      )}

      {/* Reorder Suggestions — inline when tab active, slide-over when button clicked */}
      <ReorderSuggestionsPanel
        open={reorderPanelOpen || viewMode === "reorder"}
        onClose={() => { setReorderPanelOpen(false); if (viewMode === "reorder") setViewMode("classification"); }}
        inline={viewMode === "reorder"}
        lastSoldAfter={lastSoldAfter}
        lastSoldBefore={lastSoldBefore}
        urgencyAll={leftFilterAll !== "all" ? leftFilterAll : undefined}
        urgency12M={leftFilter12m !== "all" ? leftFilter12m : undefined}
        urgency6M={leftFilter6m !== "all" ? leftFilter6m : undefined}
        urgency3M={leftFilter3m !== "all" ? leftFilter3m : undefined}
        urgency1M={leftFilter1m !== "all" ? leftFilter1m : undefined}
        velocityClass={velocityFilter !== "all" ? velocityFilter : undefined}
      />
    </div>
  );
}

// ── Row Component ──

function VelocityRow({ row }: { row: StockMonitorRow }) {
  const vc = VELOCITY_CLASSES.find((v) => v.key === row.velocityClass) ?? VELOCITY_CLASSES[4];
  const avgSales = parseFloat(row.avgDailySales30d || "0");
  const dos = row.daysOfStock ? parseFloat(row.daysOfStock) : null;

  return (
    <tr className="border-b border-border/40 transition-colors hover:bg-muted/30">
      <td className="whitespace-nowrap px-3 py-2">
        <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold", vc.badge)}>
          {vc.label}
        </span>
      </td>
      <td className="max-w-[280px] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground" title={row.productName}>{row.productName}</span>
          {row.specialOrder && <span className="shrink-0 rounded bg-blue-100 px-1.5 py-px text-[9px] font-medium text-blue-700">SO</span>}
          {row.discontinued && <span className="shrink-0 rounded bg-gray-200 px-1.5 py-px text-[9px] font-medium text-gray-600">DC</span>}
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">{row.productSku}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium">
        {row.totalStock}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
        {row.avgSellingPrice ? `₱${parseFloat(row.avgSellingPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
      </td>
      <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium",
        row.suggestedSellPrice && row.avgSellingPrice && parseFloat(row.suggestedSellPrice) > parseFloat(row.avgSellingPrice) * 1.5 ? "text-green-600" :
        row.suggestedSellPrice && row.avgSellingPrice && parseFloat(row.suggestedSellPrice) < parseFloat(row.avgSellingPrice) ? "text-red-600" :
        "text-muted-foreground"
      )}
        title={row.suggestedSellPrice && row.inflationAdjustedCost && row.appliedMarkupPct
          ? `Cost: ₱${parseFloat(row.costPrice || "0").toLocaleString("en-PH", {minimumFractionDigits:2})} → Inflation adj: ₱${parseFloat(row.inflationAdjustedCost).toLocaleString("en-PH", {minimumFractionDigits:2})} → Markup: ${row.appliedMarkupPct}% → Age: ${row.stockAgeMonths ?? 0} months`
          : undefined}
      >
        {row.suggestedSellPrice ? `₱${parseFloat(row.suggestedSellPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
      </td>
      {/* P3: Demand /month instead of avg/day */}
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={`${avgSales.toFixed(2)} avg/day (30d basis)`}>
        {avgSales > 0 ? `${(avgSales * 30).toFixed(1)} /mo` : "—"}
      </td>
      {/* P4: DOS with OUT badge when stock = 0 */}
      <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium",
        row.totalStock === 0 ? "" :
        dos !== null && dos <= 15 ? "text-red-600" :
        dos !== null && dos <= 60 ? "text-amber-600" :
        dos !== null && dos <= 180 ? "text-green-600" :
        dos !== null && dos > 180 ? "text-blue-600" : "text-muted-foreground"
      )}>
        {row.totalStock === 0
          ? <span className="inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">OUT</span>
          : dos !== null ? Math.round(dos).toLocaleString() : "∞"}
      </td>
      {/* P5: Active days with consistency badge */}
      <td className="whitespace-nowrap px-3 py-2 text-right" title={`${row.saleDaysCount} days with sales out of 180-day window`}>
        <span className="tabular-nums text-muted-foreground">{row.saleDaysCount}</span>
        <span className={cn("ml-1 inline-flex rounded px-1 py-px text-[8px] font-semibold",
          row.saleDaysCount >= 120 ? "bg-green-100 text-green-700" :
          row.saleDaysCount >= 60 ? "bg-blue-100 text-blue-700" :
          row.saleDaysCount >= 10 ? "bg-amber-100 text-amber-700" :
          "bg-gray-100 text-gray-500"
        )}>
          {row.saleDaysCount >= 120 ? "Consistent" : row.saleDaysCount >= 60 ? "Steady" : row.saleDaysCount >= 10 ? "Regular" : "Sporadic"}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {row.totalQtySold.toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
        {row.daysSinceLastSale !== null
          ? row.daysSinceLastSale === 0 ? "Today"
          : row.daysSinceLastSale === 1 ? "Yesterday"
          : row.daysSinceLastSale < 30 ? `${row.daysSinceLastSale}d ago`
          : row.daysSinceLastSale < 365 ? `${Math.floor(row.daysSinceLastSale / 30)}mo ago`
          : `${Math.floor(row.daysSinceLastSale / 365)}yr ago`
          : "Never"}
      </td>
    </tr>
  );
}

// ── Sortable Table Header ──

function SortTh({ label, field, current, dir, onSort, align, tooltip }: {
  label: string;
  field?: SortField;
  current?: SortField;
  dir?: SortDir;
  onSort?: (f: SortField) => void;
  align?: "right";
  tooltip?: string;
}) {
  const isSorted = field && current === field;
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        field && "cursor-pointer hover:text-foreground select-none",
        align === "right" && "text-right",
      )}
      onClick={field && onSort ? () => onSort(field) : undefined}
      title={tooltip}
    >
      {label}
      {isSorted && <span className="ml-0.5">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

// Shared tooltip text for the DEMAND column (used in 3 places)
const DEMAND_TOOLTIP = "Average units sold per month over the selected window (30/90/180/365d). Computed from stock_metrics.avg_daily_sales_Xd × 30.";

// ── Velocity Analysis Table (Heatmap) ──

function getBlueHeatmap(value: number, max: number): { bg: string; fg: string } {
  if (max === 0 || value === 0) return { bg: "transparent", fg: "inherit" };
  const intensity = Math.min(value / max, 1);
  const alpha = 0.1 + intensity * 0.75;
  return {
    bg: `rgba(66, 133, 244, ${alpha.toFixed(2)})`,
    fg: intensity > 0.5 ? "#ffffff" : "inherit",
  };
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 180) return `${Math.floor(diffDays / 30)}mo ago`;
  return d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

function getMonthsLeftColor(val: number | null): { bg: string; fg: string } {
  if (val === null) return { bg: "transparent", fg: "inherit" }; // ∞ — no demand
  if (val > 3) return { bg: "transparent", fg: "inherit" }; // Healthy — no highlight
  // Critical: 0 to 0.5 — dark brown, scale intensity
  if (val <= 0.5) {
    const intensity = 0.5 + (1 - val / 0.5) * 0.4; // 0.5 → 0.9
    return { bg: `rgba(181, 101, 29, ${intensity.toFixed(2)})`, fg: "#ffffff" }; // #B5651D
  }
  // Warning: 0.5 to 1.5 — gold/yellowish
  if (val <= 1.5) {
    const intensity = 0.3 + (1 - (val - 0.5) / 1.0) * 0.4; // 0.3 → 0.7
    return { bg: `rgba(212, 160, 23, ${intensity.toFixed(2)})`, fg: "#000000" }; // #D4A017
  }
  // Monitor: 1.5 to 3.0 — light brown/tan
  const intensity = 0.2 + (1 - (val - 1.5) / 1.5) * 0.3; // 0.2 → 0.5
  return { bg: `rgba(198, 142, 23, ${intensity.toFixed(2)})`, fg: "#000000" }; // #C68E17
}

// Months-left cell render: triages stock=0 → OUT, demand=0 → NO DEMAND,
// null → ∞. Used by all five LEFT columns in the Velocity Analysis table
// to eliminate the misleading "0.0" display when either numerator or
// denominator is zero.
function renderMonthsLeft(stock: number, monthsLeft: number | null): React.ReactNode {
  if (stock === 0) {
    return <span className="inline-flex rounded bg-red-100 px-1 py-px text-[9px] font-bold text-red-700">OUT</span>;
  }
  if (monthsLeft === null) return "∞";
  if (monthsLeft === 0) {
    return <span className="inline-flex rounded bg-gray-100 px-1 py-px text-[9px] font-semibold text-gray-600">NO DEMAND</span>;
  }
  return monthsLeft.toFixed(1);
}

const TREND_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  ACCELERATING: { icon: "↑", color: "text-green-600", label: "Accel" },
  STABLE: { icon: "→", color: "text-muted-foreground", label: "Stable" },
  DECELERATING: { icon: "↓", color: "text-red-600", label: "Decel" },
  STALLED: { icon: "⏸", color: "text-muted-foreground/50", label: "Stalled" },
};

type UrgencyLevel = "" | "critical" | "warning" | "ok" | "nosales";

function getWindowUrgency(monthsLeft: number | null, avgMonth: number): UrgencyLevel {
  if (avgMonth < 0.01) return "nosales";
  if (monthsLeft === null) return "nosales";
  if (monthsLeft < 0.5) return "critical";
  if (monthsLeft < 1.5) return "warning";
  return "ok";
}

interface LeftFilters { all: string; m12: string; m6: string; m3: string; m1: string }

function VelocityAnalysisTable({ rows, sortBy, sortDir, onSort, leftFilters, onLeftFilterChange, onClearLeftFilters, totalCount }: {
  rows: StockMonitorRow[]; sortBy?: string; sortDir?: string; onSort?: (field: string) => void;
  leftFilters?: LeftFilters; onLeftFilterChange?: (window: string, val: string) => void; onClearLeftFilters?: () => void;
  totalCount?: number;
}) {
  const filterAll = (leftFilters?.all || "") as UrgencyLevel;
  const filter12m = (leftFilters?.m12 || "") as UrgencyLevel;
  const filter6m = (leftFilters?.m6 || "") as UrgencyLevel;
  const filter3m = (leftFilters?.m3 || "") as UrgencyLevel;
  const filter1m = (leftFilters?.m1 || "") as UrgencyLevel;
  const hasWindowFilters = filterAll || filter12m || filter6m || filter3m || filter1m;

  const setFilterAll = (v: UrgencyLevel) => onLeftFilterChange?.("all", v);
  const setFilter12m = (v: UrgencyLevel) => onLeftFilterChange?.("12m", v);
  const setFilter6m = (v: UrgencyLevel) => onLeftFilterChange?.("6m", v);
  const setFilter3m = (v: UrgencyLevel) => onLeftFilterChange?.("3m", v);
  const setFilter1m = (v: UrgencyLevel) => onLeftFilterChange?.("1m", v);

  // No client-side filtering — all filtering is server-side now
  const filteredRows = rows;

  // Compute column maximums for heatmap scaling
  const maxSoldAll = useMemo(() => Math.max(...filteredRows.map(r => r.totalQtySold || 0), 1), [filteredRows]);
  const maxSold12m = useMemo(() => Math.max(...filteredRows.map(r => r.sold12m || 0), 1), [filteredRows]);
  const maxSold6m = useMemo(() => Math.max(...filteredRows.map(r => r.sold6m || 0), 1), [filteredRows]);
  const maxSold3m = useMemo(() => Math.max(...filteredRows.map(r => r.sold3m || 0), 1), [filteredRows]);
  const maxSold1m = useMemo(() => Math.max(...filteredRows.map(r => r.sold1m || 0), 1), [filteredRows]);

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-lg border border-border py-12 text-muted-foreground text-sm">
        No velocity data — click Recompute
      </div>
    );
  }

  const UrgencySelect = ({ value, onChange, label }: { value: UrgencyLevel; onChange: (v: UrgencyLevel) => void; label: string }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as UrgencyLevel)}
      className={cn("h-5 w-full rounded border text-[9px] outline-none px-0.5", value ? "border-amber-400 bg-amber-50 font-medium" : "border-transparent bg-transparent")}
      title={`Filter ${label}`}
    >
      <option value="">All</option>
      <option value="critical">🔴 Crit</option>
      <option value="warning">🟡 Warn</option>
      <option value="ok">🟢 OK</option>
      <option value="nosales">⚪ None</option>
    </select>
  );

  return (
    <div className="flex-1 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr>
            <th
              className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
              onClick={() => onSort?.("productName")}
            >
              Product {sortBy === "productName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Average selling price per unit">Avg Price</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-emerald-600" title="Suggested sell price (age + inflation adjusted)">Sugg. Price</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold all time">ALL</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 12 months">12M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 6 months">6M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 3 months">3M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 1 month">1M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Average units sold per month over the selected window (30/90/180/365d). Computed from stock_metrics.avg_daily_sales_Xd × 30.">DEMAND</th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at all-time rate">
              <div>Left ALL</div>
              <UrgencySelect value={filterAll} onChange={setFilterAll} label="Left ALL" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 12-month rate">
              <div>Left 12M</div>
              <UrgencySelect value={filter12m} onChange={setFilter12m} label="Left 12M" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 6-month rate">
              <div>Left 6M</div>
              <UrgencySelect value={filter6m} onChange={setFilter6m} label="Left 6M" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 3-month rate">
              <div>Left 3M</div>
              <UrgencySelect value={filter3m} onChange={setFilter3m} label="Left 3M" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 1-month rate">
              <div>Left 1M</div>
              <UrgencySelect value={filter1m} onChange={setFilter1m} label="Left 1M" />
            </th>
            <th className="whitespace-nowrap px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trend</th>
            <th className="whitespace-nowrap px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last Sold</th>
          </tr>
          {hasWindowFilters && (
            <tr className="bg-amber-50/50">
              <td colSpan={4} className="px-3 py-1 text-[10px] text-amber-700">
                LEFT column filters active — showing {filteredRows.length} items{totalCount ? ` of ${totalCount.toLocaleString()}` : ""}
              </td>
              <td colSpan={14} className="px-3 py-1 text-right">
                <button onClick={() => onClearLeftFilters?.()} className="text-[10px] text-amber-700 hover:underline">Clear filters</button>
              </td>
            </tr>
          )}
        </thead>
        <tbody>
          {filteredRows.map((row, idx) => {
            const sAll = getBlueHeatmap(row.totalQtySold || 0, maxSoldAll);
            const s12 = getBlueHeatmap(row.sold12m || 0, maxSold12m);
            const s6 = getBlueHeatmap(row.sold6m || 0, maxSold6m);
            const s3 = getBlueHeatmap(row.sold3m || 0, maxSold3m);
            const s1 = getBlueHeatmap(row.sold1m || 0, maxSold1m);

            // Compute ALL months left
            const avgMonthAll = parseFloat(row.avgDailySalesAll || "0") * 30;
            const mlAll = avgMonthAll > 0 ? row.totalStock / avgMonthAll : null;
            const ml12 = row.monthsLeft12m ? parseFloat(row.monthsLeft12m) : null;
            const ml6 = row.monthsLeft6m ? parseFloat(row.monthsLeft6m) : null;
            const ml3 = row.monthsLeft3m ? parseFloat(row.monthsLeft3m) : null;
            const ml1 = row.monthsLeft1m ? parseFloat(row.monthsLeft1m) : null;

            const cAll = getMonthsLeftColor(mlAll);
            const c12 = getMonthsLeftColor(ml12);
            const c6 = getMonthsLeftColor(ml6);
            const c3 = getMonthsLeftColor(ml3);
            const c1 = getMonthsLeftColor(ml1);

            const trend = TREND_CONFIG[row.velocityTrend || ""] ?? TREND_CONFIG.STABLE;

            return (
              <tr key={`${row.id}-${idx}`} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                <td className="max-w-[220px] px-3 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-medium text-foreground text-[11px]" title={row.productName}>{row.productName}</span>
                    {row.specialOrder && <span className="shrink-0 rounded bg-blue-100 px-1 py-px text-[8px] font-medium text-blue-700">SO</span>}
                    {row.discontinued && <span className="shrink-0 rounded bg-gray-200 px-1 py-px text-[8px] font-medium text-gray-600">DC</span>}
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground">{row.productSku}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-semibold">{row.totalStock}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.avgSellingPrice ? `₱${parseFloat(row.avgSellingPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </td>
                <td className={cn("whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium",
                  row.suggestedSellPrice && row.avgSellingPrice && parseFloat(row.suggestedSellPrice) > parseFloat(row.avgSellingPrice) * 1.5 ? "text-green-600" :
                  row.suggestedSellPrice && row.avgSellingPrice && parseFloat(row.suggestedSellPrice) < parseFloat(row.avgSellingPrice) ? "text-red-600" :
                  "text-emerald-600"
                )}
                  title={row.suggestedSellPrice && row.inflationAdjustedCost
                    ? `Age: ${row.stockAgeMonths ?? 0}mo · Adj cost: ₱${parseFloat(row.inflationAdjustedCost).toLocaleString("en-PH", {minimumFractionDigits:2})} · Markup: ${row.appliedMarkupPct}%`
                    : undefined}
                >
                  {row.suggestedSellPrice ? `₱${parseFloat(row.suggestedSellPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </td>
                {/* Sold heatmap columns — ALL + 12M/6M/3M/1M */}
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: sAll.bg, color: sAll.fg }}>{row.totalQtySold || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s12.bg, color: s12.fg }}>{row.sold12m || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s6.bg, color: s6.fg }}>{row.sold6m || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s3.bg, color: s3.fg }}>{row.sold3m || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s1.bg, color: s1.fg }}>{row.sold1m || 0}</td>
                {/* DEMAND (per-month) */}
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{parseFloat(row.avgMonth12m || "0").toFixed(1)}</td>
                {/* Months left heatmap — LEFT ALL + 12M/6M/3M/1M */}
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: cAll.bg, color: cAll.fg }}>{renderMonthsLeft(row.totalStock, mlAll)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c12.bg, color: c12.fg }}>{renderMonthsLeft(row.totalStock, ml12)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c6.bg, color: c6.fg }}>{renderMonthsLeft(row.totalStock, ml6)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c3.bg, color: c3.fg }}>{renderMonthsLeft(row.totalStock, ml3)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c1.bg, color: c1.fg }}>{renderMonthsLeft(row.totalStock, ml1)}</td>
                {/* Trend */}
                <td className="whitespace-nowrap px-2 py-1.5 text-center">
                  <span className={cn("text-[11px] font-medium", trend.color)} title={`${row.velocityTrend}: ${parseFloat(row.avgMonth3m||"0").toFixed(1)}/mo (3m) vs ${parseFloat(row.avgMonth12m||"0").toFixed(1)}/mo (12m)`}>
                    {trend.icon} {trend.label}
                  </span>
                </td>
                {/* Last Sold */}
                <td className={cn("whitespace-nowrap px-2 py-1.5 text-[11px]",
                  row.daysSinceLastSale !== null && row.daysSinceLastSale > 180 ? "text-muted-foreground/50" : "text-muted-foreground"
                )}>
                  {row.lastSaleDate ? formatRelativeDate(row.lastSaleDate) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
