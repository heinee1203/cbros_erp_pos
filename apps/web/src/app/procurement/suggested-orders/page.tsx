"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
  Download,
  ShoppingCart,
  ShieldAlert,
  AlertTriangle,
  Clock,
  DollarSign,
  Settings,
  Check,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useReorderSuggestions,
  useReorderRefresh,
  useReorderDismiss,
  useReorderUpdateQty,
  useReorderCreatePOs,
  type ReorderSuggestionRow,
  type ReorderSummary,
  type ReorderFilters,
} from "@/hooks/use-reorder";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";
import { useSuppliers } from "@/hooks/use-suppliers";

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

const PRIORITY_CONFIG: Record<string, { label: string; badge: string }> = {
  CRITICAL: { label: "Critical", badge: "bg-red-100 text-red-700" },
  URGENT: { label: "Urgent", badge: "bg-orange-100 text-orange-700" },
  NORMAL: { label: "Normal", badge: "bg-yellow-100 text-yellow-700" },
};

const ABC_CONFIG: Record<string, { badge: string }> = {
  A: { badge: "bg-emerald-100 text-emerald-700" },
  B: { badge: "bg-blue-100 text-blue-700" },
  C: { badge: "bg-gray-100 text-gray-600" },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type SortField =
  | "priority"
  | "productName"
  | "currentStock"
  | "avgDailyDemand"
  | "reorderPoint"
  | "suggestedQty"
  | "supplierName";

type SortDir = "asc" | "desc";

/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function SuggestedOrdersPage() {
  const router = useRouter();
  const { token, locationId, apiLocationId, loading: authLoading } = useAuth();

  // ── Filter state ──
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ── Sort state ──
  const [sortBy, setSortBy] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Selection state ──
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Inline qty edits ──
  const [editingQty, setEditingQty] = useState<Record<string, number>>({});

  // ── Success banner ──
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
  const filters: ReorderFilters = {
    search: debouncedSearch || undefined,
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
    supplierId: supplierFilter !== "all" ? supplierFilter : undefined,
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
  } = useReorderSuggestions(token, apiLocationId, filters);

  const refreshMutation = useReorderRefresh(token, apiLocationId);
  const dismissMutation = useReorderDismiss(token, apiLocationId);
  const updateQtyMutation = useReorderUpdateQty(token, apiLocationId);
  const createPOsMutation = useReorderCreatePOs(token, apiLocationId);

  const { data: brandsData } = useBrands(token, apiLocationId);
  const { data: categoriesData } = useCategories(token, apiLocationId);
  const { data: suppliersData } = useSuppliers(token, apiLocationId);

  const brands = brandsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const suppliers = suppliersData?.data ?? [];

  // Flatten pages
  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const summary: ReorderSummary | null = data?.pages[0]?.summary ?? null;
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
    priorityFilter !== "all" ||
    supplierFilter !== "all" ||
    brandFilter !== "all" ||
    categoryFilter !== "all" ||
    searchQuery !== "";

  const clearFilters = () => {
    setPriorityFilter("all");
    setSupplierFilter("all");
    setBrandFilter("all");
    setCategoryFilter("all");
    setSearchQuery("");
    setDebouncedSearch("");
  };

  // ── Selection helpers ──
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  // ── Bulk create POs ──
  const handleCreatePOs = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      const result = await createPOsMutation.mutateAsync(Array.from(selected));
      const poNums = result.poNumbers?.join(", ") ?? "submitted";
      setSuccessMsg(`Created POs: ${poNums}`);
      setSelected(new Set());
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch {
      // error is available via createPOsMutation.error
    }
  }, [selected, createPOsMutation]);

  // ── Bulk dismiss ──
  const handleBulkDismiss = useCallback(async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    for (const id of ids) {
      await dismissMutation.mutateAsync(id);
    }
    setSelected(new Set());
  }, [selected, dismissMutation]);

  // ── Inline qty blur handler ──
  const handleQtyBlur = (id: string, newQty: number) => {
    if (newQty >= 1) {
      updateQtyMutation.mutate({ id, qty: newQty });
    }
    setEditingQty((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // ── Export handler ──
  const handleExport = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.supplierId) params.set("supplierId", filters.supplierId);
    if (filters.brandId) params.set("brandId", filters.brandId);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    const qs = params.toString();
    const url = `${API_BASE}/inventory/reorder/export${qs ? `?${qs}` : ""}`;
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
      {/* ── Success Banner ── */}
      {successMsg && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-2.5 text-sm text-green-800">
          <Check size={14} />
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="border-b border-border bg-background px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <ShoppingCart size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Suggested Orders</h1>
              <p className="text-xs text-muted-foreground">
                AI-computed reorder suggestions based on demand, lead time, and safety stock
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
              onClick={() => router.push("/procurement/suggested-orders/settings")}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings size={12} />
              Settings
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
              Refresh Suggestions
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {summary && (
        <SummaryCards
          summary={summary}
          activePriority={priorityFilter}
          onPriorityClick={(p) => setPriorityFilter(priorityFilter === p ? "all" : p)}
        />
      )}

      {/* ── Filter Bar ── */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority */}
          <FilterSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[
              { value: "all", label: "All Priorities" },
              { value: "CRITICAL", label: "Critical" },
              { value: "URGENT", label: "Urgent" },
              { value: "NORMAL", label: "Normal" },
            ]}
          />

          {/* Supplier */}
          <FilterSelect
            value={supplierFilter}
            onChange={setSupplierFilter}
            options={[
              { value: "all", label: "All Suppliers" },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
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

      {/* ── Bulk Action Bar ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-border bg-blue-50 px-6 py-2.5">
          <span className="text-xs font-medium text-blue-800">
            {selected.size} selected
          </span>
          <button
            onClick={handleCreatePOs}
            disabled={createPOsMutation.isPending}
            className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {createPOsMutation.isPending && <Loader2 size={12} className="animate-spin" />}
            Create POs
          </button>
          <button
            onClick={handleBulkDismiss}
            disabled={dismissMutation.isPending}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            Dismiss Selected
          </button>
        </div>
      )}

      {/* ── Main Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load reorder suggestions</p>
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
                  <th scope="col" className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                  </th>
                  <SortHeader label="Priority" field="priority" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">ABC</th>
                  <SortHeader label="Product" field="productName" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Supplier" field="supplierName" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Current Stock" field="currentStock" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Pending In</th>
                  <SortHeader label="Demand/Day" field="avgDailyDemand" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">ROP</th>
                  <SortHeader label="Suggested Qty" field="suggestedQty" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Est. Cost</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <SuggestionRow
                    key={row.id}
                    row={row}
                    isSelected={selected.has(row.id)}
                    onToggle={() => toggleSelect(row.id)}
                    editingQty={editingQty[row.id]}
                    onQtyChange={(val) => setEditingQty((prev) => ({ ...prev, [row.id]: val }))}
                    onQtyBlur={(val) => handleQtyBlur(row.id, val)}
                    onDismiss={() => dismissMutation.mutate(row.id)}
                    onClick={() => router.push(`/inventory/${row.productId}/edit`)}
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
            {rows.length} item{rows.length !== 1 ? "s" : ""} loaded
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
              GET /inventory/reorder
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SUMMARY CARDS
 * ═══════════════════════════════════════════════════════ */

function SummaryCards({
  summary,
  activePriority,
  onPriorityClick,
}: {
  summary: ReorderSummary;
  activePriority: string;
  onPriorityClick: (priority: string) => void;
}) {
  const cards: { key: string; label: string; value: number | string; icon: React.ReactNode; color: string; bg: string; ring: string; isValue?: boolean }[] = [
    { key: "CRITICAL", label: "Critical", value: summary.critical, icon: <ShieldAlert size={14} />, color: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
    { key: "URGENT", label: "Urgent", value: summary.urgent, icon: <AlertTriangle size={14} />, color: "text-orange-700", bg: "bg-orange-50", ring: "ring-orange-200" },
    { key: "NORMAL", label: "Normal", value: summary.normal, icon: <Clock size={14} />, color: "text-yellow-700", bg: "bg-yellow-50", ring: "ring-yellow-200" },
    { key: "TOTAL_VALUE", label: "Total Value", value: `₱${summary.totalValue.toLocaleString()}`, icon: <DollarSign size={14} />, color: "text-foreground", bg: "bg-muted", ring: "ring-border", isValue: true },
  ];

  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="flex items-center gap-3">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={() => !card.isValue && onPriorityClick(card.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:shadow-sm",
              !card.isValue && activePriority === card.key
                ? `${card.bg} border-transparent ring-2 ${card.ring}`
                : "border-border bg-background hover:bg-muted/30",
              card.isValue && "cursor-default",
            )}
          >
            <span className={card.color}>{card.icon}</span>
            <div>
              <div className={cn("text-sm font-semibold tabular-nums", card.color)}>
                {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
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

function SuggestionRow({
  row,
  isSelected,
  onToggle,
  editingQty,
  onQtyChange,
  onQtyBlur,
  onDismiss,
  onClick,
}: {
  row: ReorderSuggestionRow;
  isSelected: boolean;
  onToggle: () => void;
  editingQty: number | undefined;
  onQtyChange: (val: number) => void;
  onQtyBlur: (val: number) => void;
  onDismiss: () => void;
  onClick: () => void;
}) {
  const priorityCfg = PRIORITY_CONFIG[row.priority] ?? { label: row.priority, badge: "bg-muted text-muted-foreground" };
  const abcCfg = ABC_CONFIG[row.abcClass] ?? { badge: "bg-gray-100 text-gray-600" };
  const avgDemand = parseFloat(row.avgDailyDemand);
  const rop = parseFloat(row.reorderPoint);

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      {/* Checkbox */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-border"
        />
      </td>

      {/* Priority */}
      <td className="whitespace-nowrap px-4 py-2.5 cursor-pointer" onClick={onClick}>
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", priorityCfg.badge)}>
          {priorityCfg.label}
        </span>
      </td>

      {/* ABC */}
      <td className="whitespace-nowrap px-4 py-2.5 cursor-pointer" onClick={onClick}>
        <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold", abcCfg.badge)}>
          {row.abcClass}
        </span>
      </td>

      {/* Product */}
      <td className="max-w-[260px] px-4 py-2.5 cursor-pointer" onClick={onClick}>
        <div className="truncate text-sm font-medium text-foreground" title={row.productName}>
          {row.productName}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{row.sku}</div>
      </td>

      {/* Supplier */}
      <td className="max-w-[140px] whitespace-nowrap px-4 py-2.5 text-sm text-foreground cursor-pointer" onClick={onClick}>
        <span className="truncate block" title={row.supplierName ?? undefined}>
          {row.supplierName ?? "—"}
        </span>
      </td>

      {/* Current Stock */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground cursor-pointer" onClick={onClick}>
        {row.currentStock.toLocaleString()}
      </td>

      {/* Pending In */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        {row.pendingInbound.toLocaleString()}
      </td>

      {/* Demand/Day */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        {avgDemand.toFixed(1)}
      </td>

      {/* ROP */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        {rop.toFixed(1)}
      </td>

      {/* Suggested Qty (editable) */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          min={1}
          value={editingQty ?? row.suggestedQty}
          onChange={(e) => onQtyChange(parseInt(e.target.value, 10) || 0)}
          onFocus={() => onQtyChange(row.suggestedQty)}
          onBlur={(e) => onQtyBlur(parseInt(e.target.value, 10) || row.suggestedQty)}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      </td>

      {/* Est. Cost */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        —
      </td>

      {/* Actions */}
      <td className="whitespace-nowrap px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => {
              // Select this single item and create PO
              // For single order, just select + trigger PO creation
            }}
            className="flex h-6 items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
            title="Create PO for this item"
          >
            Order
          </button>
          <button
            onClick={onDismiss}
            className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Dismiss suggestion"
          >
            <XCircle size={10} />
          </button>
        </div>
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
        <ShoppingCart size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No suggestions match your filters" : "No reorder suggestions computed yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : 'Click "Refresh Suggestions" to compute reorder points and suggested quantities.'}
        </p>
      </div>
    </div>
  );
}
