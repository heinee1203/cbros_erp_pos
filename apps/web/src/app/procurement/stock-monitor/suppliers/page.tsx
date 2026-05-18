"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Truck } from "lucide-react";

import { useAuth } from "@/app/auth-context";
import { useSupplierMetrics } from "@/hooks/use-stock-monitor";
import { EmptyState } from "./components/empty-state";
import { FilterBar } from "./components/filter-bar";
import { SupplierMetricsTable } from "./components/supplier-metrics-table";
import type { SortDir, SortField } from "./types";

export default function SupplierMetricsPage() {
  const { token, apiLocationId, loading: authLoading } = useAuth();

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

  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[1](setTimeout(() => setDebouncedSearch(value), 300));
  };

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

  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

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

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
  };

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

      <FilterBar
        searchQuery={searchQuery}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={handleSearchChange}
        onClear={clearFilters}
      />

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
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <SupplierMetricsTable
            rows={rows}
            isFetchingNextPage={isFetchingNextPage}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            sentinelRef={sentinelRef}
          />
        )}
      </div>

      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length} supplier{rows.length !== 1 ? "s" : ""} loaded
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
              GET /inventory/stock-monitor/suppliers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
