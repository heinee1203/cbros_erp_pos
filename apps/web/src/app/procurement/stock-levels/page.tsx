"use client";

import { useState, useMemo } from "react";
import {
  Warehouse,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  ChevronsDown,
  Package,
  AlertTriangle,
  PackageX,
  ShieldAlert,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useStockLevels,
  type StockLevelRow,
  type StockLevelsSummary,
  type SortField,
  type SortDir,
} from "@/hooks/use-stock-levels";

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

// Category badge uses a single neutral style — category names come from the DB now

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

const STATUS_STYLES: Record<string, string> = {
  IN_STOCK: "bg-success/10 text-success",
  LOW_STOCK: "bg-warning/10 text-warning",
  OUT_OF_STOCK: "bg-destructive/10 text-destructive",
};


/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function StockLevelsPage() {
  const { token, locationId, loading: authLoading } = useAuth();

  // ── Filter state ──
  const [allLocations, setAllLocations] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [belowReorder, setBelowReorder] = useState(false);

  // ── Sort state ──
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  // ── Query ──
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useStockLevels(token, locationId, {
    allLocations,
    search: debouncedSearch || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    stockStatus: stockStatusFilter !== "all" ? (stockStatusFilter as any) : undefined,
    belowReorder: belowReorder || undefined,
    sortBy,
    sortDir,
  });

  // Flatten pages
  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  // Summary from the first (most recent) page
  const summary: StockLevelsSummary | null = data?.pages[0]?.summary ?? null;

  // Build dynamic category list from loaded data
  const uniqueCategories = useMemo(() => {
    const cats = new Set(rows.map((r) => r.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [rows]);

  const totalLoaded = rows.length;

  const hasActiveFilters =
    categoryFilter !== "all" ||
    stockStatusFilter !== "all" ||
    searchQuery !== "" ||
    belowReorder;

  const clearFilters = () => {
    setCategoryFilter("all");
    setStockStatusFilter("all");
    setSearchQuery("");
    setDebouncedSearch("");
    setBelowReorder(false);
  };

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
              <Warehouse size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Stock Levels</h1>
              <p className="text-xs text-muted-foreground">
                Monitor on-hand, reserved, and available stock — identify items below reorder point
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      {summary && <SummaryStrip summary={summary} />}

      {/* ── Filter Bar ── */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Toggle */}
          <button
            onClick={() => setAllLocations(!allLocations)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              allLocations
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {allLocations ? "All Locations" : "Current Location"}
          </button>

          {/* Category */}
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "All Categories" },
              ...uniqueCategories.map((c) => ({
                value: c,
                label: c,
              })),
            ]}
          />

          {/* Stock Status */}
          <FilterSelect
            value={stockStatusFilter}
            onChange={setStockStatusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "IN_STOCK", label: "In Stock" },
              { value: "LOW_STOCK", label: "Low Stock" },
              { value: "OUT_OF_STOCK", label: "Out of Stock" },
            ]}
          />

          {/* Below Reorder Toggle */}
          <button
            onClick={() => setBelowReorder(!belowReorder)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              belowReorder
                ? "border-warning/30 bg-warning/5 text-warning"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <AlertTriangle size={12} />
            Below Reorder
          </button>

          {/* Search */}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search item, SKU..."
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
            <p className="text-sm font-medium text-destructive">Failed to load stock levels</p>
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
                <SortHeader label="Item" field="name" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="SKU" field="sku" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Category" field="category" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Location" field="location" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="On Hand" field="stockLevel" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Reserved" field="reservedLevel" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Available" field="available" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Reorder Pt" field="reorderPoint" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Optimal</th>
                <SortHeader label="Status" field="status" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <StockRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {totalLoaded}
            {summary ? ` of ${summary.totalSkus.toLocaleString()}` : ""} item{totalLoaded !== 1 ? "s" : ""} loaded
            {hasActiveFilters ? " (filtered)" : ""}
            {hasNextPage ? " — more available" : ""}
          </span>
          <div className="flex items-center gap-3">
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ChevronsDown size={12} />
                )}
                Load More
              </button>
            )}
            <span className="flex items-center gap-1 rounded bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              Live data — GET /inventory/stock-levels
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SUMMARY STRIP
 * ═══════════════════════════════════════════════════════ */

function SummaryStrip({ summary }: { summary: StockLevelsSummary }) {
  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="flex items-center gap-5">
        <SummaryChip
          icon={<Package size={13} />}
          label="Total Items"
          value={summary.totalSkus.toLocaleString()}
          color="text-foreground"
        />
        <div className="h-5 w-px bg-border" />
        <SummaryChip
          icon={<Archive size={13} />}
          label="In Stock"
          value={summary.inStock.toLocaleString()}
          color="text-success"
        />
        <SummaryChip
          icon={<AlertTriangle size={13} />}
          label="Low Stock"
          value={summary.lowStock.toLocaleString()}
          color="text-warning"
          highlight={summary.lowStock > 0}
        />
        <SummaryChip
          icon={<PackageX size={13} />}
          label="Out of Stock"
          value={summary.outOfStock.toLocaleString()}
          color="text-destructive"
          highlight={summary.outOfStock > 0}
        />
        <div className="h-5 w-px bg-border" />
        <SummaryChip
          icon={<ShieldAlert size={13} />}
          label="Below Reorder"
          value={summary.belowReorder.toLocaleString()}
          color="text-warning"
          highlight={summary.belowReorder > 0}
        />
        <SummaryChip
          icon={<Package size={13} />}
          label="Reserved"
          value={summary.totalReserved.toLocaleString()}
          color="text-muted-foreground"
        />
      </div>
    </div>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={color}>{icon}</span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-sm font-semibold tabular-nums ${color} ${
            highlight ? "animate-pulse" : ""
          }`}
        >
          {value}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TABLE ROW
 * ═══════════════════════════════════════════════════════ */

function StockRow({ row }: { row: StockLevelRow }) {
  const catLabel = row.category || "Uncategorized";
  const catStyle = "bg-muted text-muted-foreground";
  const statusLabel = STATUS_LABELS[row.status] ?? row.status;
  const statusStyle = STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground";

  const isLow = row.status === "LOW_STOCK";
  const isOut = row.status === "OUT_OF_STOCK";
  const unitSuffix = row.sellingUnit && row.sellingUnit !== "piece" ? ` ${row.sellingUnit}` : "";

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      {/* Product */}
      <td className="max-w-[240px] px-4 py-2.5">
        <div className="truncate text-sm font-medium text-foreground" title={row.productName}>
          {row.productName}
        </div>
        {row.familyName && (
          <div className="truncate text-[10px] text-muted-foreground">{row.familyName}</div>
        )}
      </td>

      {/* SKU */}
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
        {row.productSku}
      </td>

      {/* Category Badge */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${catStyle}`}
        >
          {catLabel}
        </span>
      </td>

      {/* Location */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
        {row.locationName}
      </td>

      {/* On Hand */}
      <td
        className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm ${
          isOut ? "font-semibold text-destructive" : isLow ? "font-medium text-warning" : "text-foreground"
        }`}
      >
        {row.stockLevel.toLocaleString()}{unitSuffix}
      </td>

      {/* Reserved */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.reservedLevel > 0 ? `${row.reservedLevel.toLocaleString()}${unitSuffix}` : "—"}
      </td>

      {/* Available */}
      <td
        className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium ${
          isOut ? "text-destructive" : isLow ? "text-warning" : "text-foreground"
        }`}
      >
        {row.available.toLocaleString()}{unitSuffix}
      </td>

      {/* Reorder Point */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.reorderPoint.toLocaleString()}{unitSuffix}
      </td>

      {/* Optimal Stock */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm">
        {row.optimalStock > 0 ? (
          <span className={row.stockLevel < row.optimalStock ? "text-amber-600 font-medium" : "text-muted-foreground"}>
            {row.optimalStock.toLocaleString()}{unitSuffix}
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>

      {/* Status Badge */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle}`}
        >
          {isOut && <PackageX size={11} />}
          {isLow && <AlertTriangle size={11} />}
          {statusLabel}
        </span>
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
        <Warehouse size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No items match your filters" : "No inventory tracked"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : "Inventory records will appear here once stock is received."}
        </p>
      </div>
    </div>
  );
}
