"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Truck,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSupplierMetrics, type SupplierMetricsRow } from "@/hooks/use-stock-monitor";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

type SortField = "supplierName" | "poCount6m" | "avgLeadTimeDays" | "reliabilityPct";
type SortDir = "asc" | "desc";

/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function SupplierMetricsPage() {
  const { token, apiLocationId, loading: authLoading } = useAuth();

  // ── Filter & sort state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("avgLeadTimeDays");
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
  } = useSupplierMetrics(token, apiLocationId, {
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
  });

  // Flatten pages
  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

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

  const hasActiveFilters = searchQuery !== "";

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
            <Link
              href="/procurement/stock-monitor"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-accent"
            >
              <ArrowLeft size={16} className="text-muted-foreground" />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Truck size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Supplier Lead Times</h1>
              <p className="text-xs text-muted-foreground">
                Purchase order frequency, lead times, and reliability by supplier
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search supplier..."
              className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => { setSearchQuery(""); setDebouncedSearch(""); }}
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
            <p className="text-sm font-medium text-destructive">Failed to load supplier metrics</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Truck size={24} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasActiveFilters ? "No suppliers match your search" : "No supplier metrics computed yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasActiveFilters
                  ? "Try broadening your search."
                  : "Refresh metrics from the Stock Monitor page to compute supplier data."}
              </p>
            </div>
          </div>
        ) : (
          <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
                <tr>
                  <SortHeader label="Supplier" field="supplierName" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="PO Count (6m)" field="poCount6m" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Avg Lead Time" field="avgLeadTimeDays" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Min</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Max</th>
                  <SortHeader label="Reliability" field="reliabilityPct" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Last PO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <SupplierRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
            <div ref={sentinelRef} className="h-4" />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length} supplier{rows.length !== 1 ? "s" : ""} loaded
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
              GET /inventory/stock-monitor/suppliers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TABLE ROW
 * ═══════════════════════════════════════════════════════ */

function SupplierRow({ row }: { row: SupplierMetricsRow }) {
  const reliability = row.reliabilityPct != null ? parseFloat(row.reliabilityPct) : null;
  const avgLead = row.avgLeadTimeDays != null ? parseFloat(row.avgLeadTimeDays) : null;

  let reliabilityColor = "text-muted-foreground";
  if (reliability != null) {
    if (reliability >= 90) reliabilityColor = "text-green-700";
    else if (reliability >= 70) reliabilityColor = "text-amber-700";
    else reliabilityColor = "text-red-700";
  }

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      {/* Supplier Name */}
      <td className="max-w-[280px] px-4 py-2.5">
        <div className="truncate text-sm font-medium text-foreground" title={row.supplierName}>
          {row.supplierName}
        </div>
      </td>

      {/* PO Count (6m) */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
        {row.poCount6m}
      </td>

      {/* Avg Lead Time */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium text-foreground">
        {avgLead != null ? `${avgLead.toFixed(1)}d` : "—"}
      </td>

      {/* Min Lead Time */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.minLeadTimeDays != null ? `${row.minLeadTimeDays}d` : "—"}
      </td>

      {/* Max Lead Time */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.maxLeadTimeDays != null ? `${row.maxLeadTimeDays}d` : "—"}
      </td>

      {/* Reliability % */}
      <td className={cn("whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium", reliabilityColor)}>
        {reliability != null ? `${reliability.toFixed(1)}%` : "—"}
      </td>

      {/* Last PO Date */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-muted-foreground">
        {row.lastPoDate ? new Date(row.lastPoDate).toLocaleDateString() : "—"}
      </td>
    </tr>
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
