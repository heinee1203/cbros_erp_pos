"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
  Download,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
  Package,
  PackageX,
  TrendingUp,
  Archive,
  Sparkles,
} from "lucide-react";
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
import { AiAdvisorPanel } from "@/components/ai-advisor-panel";

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

const STATUS_CONFIG: Record<string, { label: string; badge: string; text: string }> = {
  CRITICAL: { label: "Critical", badge: "bg-red-100 text-red-700", text: "text-red-700" },
  LOW: { label: "Low", badge: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  HEALTHY: { label: "Healthy", badge: "bg-green-100 text-green-700", text: "text-green-700" },
  OVERSTOCK: { label: "Overstock", badge: "bg-blue-100 text-blue-700", text: "text-blue-700" },
  DEAD_STOCK: { label: "Dead Stock", badge: "bg-gray-100 text-gray-600", text: "text-gray-600" },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type SortField =
  | "productName"
  | "totalStock"
  | "avgDailySales30d"
  | "daysOfStock"
  | "stockoutDays90d"
  | "lastPoDate"
  | "status";

type SortDir = "asc" | "desc";

/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function StockMonitorPage() {
  const router = useRouter();
  const { token, locationId, apiLocationId, loading: authLoading } = useAuth();

  // ── Filter state ──
  const [statusFilter, setStatusFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ── Sort state ──
  const [sortBy, setSortBy] = useState<SortField>("daysOfStock");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── AI Advisor panel ──
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiProductIds, setAiProductIds] = useState<string[]>([]);
  const [aiProductNames, setAiProductNames] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<"single" | "multi" | "budget">("single");

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  // ── Debounce search ──
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[1](
      setTimeout(() => setDebouncedSearch(value), 300),
    );
  };

  // ── Build filters ──
  const filters: StockMonitorFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    brandId: brandFilter !== "all" ? brandFilter : undefined,
    categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    sortBy: sortBy,
    sortDir: sortDir,
  };

  // ── Queries ──
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

  const brands = brandsData?.data ?? [];
  const categories = categoriesData?.data ?? [];

  // Flatten pages
  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const summary: StockMonitorSummary | null = data?.pages[0]?.summary ?? null;
  const lastComputed = rows[0]?.computedAt ?? null;

  // ── Infinite scroll sentinel ──
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
    setSearchQuery("");
    setDebouncedSearch("");
  };

  // ── Export handler ──
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

  // ── Auth loading ──
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Page Header ── */}
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

      {/* ── Summary Cards ── */}
      {summary && (
        <SummaryCards
          summary={summary}
          activeStatus={statusFilter}
          onStatusClick={(s) => setStatusFilter(statusFilter === s ? "all" : s)}
        />
      )}

      {/* ── Filter Bar ── */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status */}
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

          {/* Brand */}
          <FilterSelect
            value={brandFilter}
            onChange={setBrandFilter}
            options={[
              { value: "all", label: "All Brands" },
              ...brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />

          {/* Category */}
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "All Categories" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />

          {/* Search */}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search product, SKU..."
              className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Main Table ── */}
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
                  <SortHeader label="Status" field="status" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Product" field="productName" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Brand</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Category</th>
                  <SortHeader label="Total Stock" field="totalStock" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Avg Sales/Day" field="avgDailySales30d" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Days of Stock" field="daysOfStock" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Stockout Days" field="stockoutDays90d" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Last PO" field="lastPoDate" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Lead Time</th>
                  <th scope="col" className="w-10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-center">AI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <StockMonitorRow
                    key={row.id}
                    row={row}
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
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length}
            {summary ? ` of ${summary.total.toLocaleString()}` : ""} item{rows.length !== 1 ? "s" : ""} loaded
            {hasActiveFilters ? " (filtered)" : ""}
            {hasNextPage ? " — more available" : ""}
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
        onClose={() => { setAiPanelOpen(false); setAiProductIds([]); setAiProductNames([]); }}
        productIds={aiProductIds}
        productNames={aiProductNames}
        mode={aiMode}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SUMMARY CARDS
 * ═══════════════════════════════════════════════════════ */

function SummaryCards({
  summary,
  activeStatus,
  onStatusClick,
}: {
  summary: StockMonitorSummary;
  activeStatus: string;
  onStatusClick: (status: string) => void;
}) {
  const cards: { key: string; label: string; value: number; icon: React.ReactNode; color: string; bg: string; ring: string }[] = [
    { key: "CRITICAL", label: "Critical", value: summary.critical, icon: <ShieldAlert size={14} />, color: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
    { key: "LOW", label: "Low", value: summary.low, icon: <AlertTriangle size={14} />, color: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200" },
    { key: "HEALTHY", label: "Healthy", value: summary.healthy, icon: <TrendingUp size={14} />, color: "text-green-700", bg: "bg-green-50", ring: "ring-green-200" },
    { key: "OVERSTOCK", label: "Overstock", value: summary.overstock, icon: <Package size={14} />, color: "text-blue-700", bg: "bg-blue-50", ring: "ring-blue-200" },
    { key: "DEAD_STOCK", label: "Dead Stock", value: summary.deadStock, icon: <Archive size={14} />, color: "text-gray-600", bg: "bg-gray-50", ring: "ring-gray-200" },
    { key: "OUT_OF_STOCK", label: "Out of Stock", value: summary.outOfStock, icon: <PackageX size={14} />, color: "text-slate-800", bg: "bg-slate-100", ring: "ring-slate-300" },
  ];

  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="flex items-center gap-3">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={() => onStatusClick(card.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:shadow-sm",
              activeStatus === card.key
                ? `${card.bg} border-transparent ring-2 ${card.ring}`
                : "border-border bg-background hover:bg-muted/30",
            )}
          >
            <span className={card.color}>{card.icon}</span>
            <div>
              <div className={cn("text-sm font-semibold tabular-nums", card.color)}>
                {card.value.toLocaleString()}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TABLE ROW
 * ═══════════════════════════════════════════════════════ */

function StockMonitorRow({ row, onClick, onAskAi }: { row: StockMonitorRow; onClick: () => void; onAskAi: () => void }) {
  const cfg = STATUS_CONFIG[row.status] ?? { label: row.status, badge: "bg-muted text-muted-foreground", text: "text-muted-foreground" };
  const avgSales = parseFloat(row.avgDailySales30d);
  const daysOfStock = row.daysOfStock != null ? parseFloat(row.daysOfStock) : null;

  return (
    <tr
      onClick={onClick}
      className="group cursor-pointer transition-colors hover:bg-muted/30"
    >
      {/* Status */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", cfg.badge)}>
          {cfg.label}
        </span>
      </td>

      {/* Product */}
      <td className="max-w-[260px] px-4 py-2.5">
        <div className="truncate text-sm font-medium text-foreground" title={row.productName}>
          {row.productName}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{row.productSku}</div>
      </td>

      {/* Brand */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
        {row.brandName ?? "—"}
      </td>

      {/* Category */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
        {row.categoryName ?? "—"}
      </td>

      {/* Total Stock */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
        {row.totalStock.toLocaleString()}
      </td>

      {/* Avg Daily Sales (30d) */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {avgSales.toFixed(1)}
      </td>

      {/* Days of Stock */}
      <td className={cn("whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium", cfg.text)}>
        {daysOfStock != null ? Math.round(daysOfStock).toLocaleString() : "—"}
      </td>

      {/* Stockout Days (90d) */}
      <td className={cn(
        "whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm",
        row.stockoutDays90d > 0 ? "font-medium text-red-600" : "text-muted-foreground",
      )}>
        {row.stockoutDays90d}
      </td>

      {/* Last PO */}
      <td className="max-w-[140px] px-4 py-2.5">
        {row.lastPoDate ? (
          <div>
            <div className="text-xs text-foreground">
              {new Date(row.lastPoDate).toLocaleDateString()}
            </div>
            {row.lastPoSupplierName && (
              <div className="truncate text-[10px] text-muted-foreground" title={row.lastPoSupplierName}>
                {row.lastPoSupplierName}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Lead Time */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.lastLeadTimeDays != null ? `${row.lastLeadTimeDays}d` : "—"}
      </td>

      {/* AI */}
      <td className="whitespace-nowrap px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onAskAi}
          className="rounded p-1 text-amber-500 hover:bg-amber-50"
          title="Ask AI"
        >
          <Sparkles size={13} />
        </button>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * FILTER SELECT
 * ═══════════════════════════════════════════════════════ */

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SORTABLE HEADER
 * ═══════════════════════════════════════════════════════ */

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort === field;
  return (
    <th
      scope="col"
      className={cn(
        "cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
        align === "right" && "text-right",
        isActive && "text-foreground",
      )}
      onClick={() => onSort(field)}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {label}
        {isActive ? (
          currentDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ChevronsUpDown size={12} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

/* ═══════════════════════════════════════════════════════
 * EMPTY STATE
 * ═══════════════════════════════════════════════════════ */

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Activity size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No items match your filters" : "No stock metrics computed yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : 'Click "Refresh Metrics" to compute sales velocity and stock days.'}
        </p>
      </div>
    </div>
  );
}
