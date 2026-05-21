import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronsDown, History, Loader2, Search, X } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { useAuth } from "@/app/auth-context";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PriceHistoryPage } from "../types";
import { fmtCurrency, fmtPct } from "../utils";

export function PriceHistoryTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldFilter, setFieldFilter] = useState<"" | "COST_PRICE" | "SELL_PRICE">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [batchId, setBatchId] = useState("");

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<PriceHistoryPage>({
    queryKey: ["price-history", debouncedSearch, fieldFilter, dateFrom, dateTo, batchId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (pageParam) params.set("cursor", pageParam as string);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (fieldFilter) params.set("field", fieldFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (batchId) params.set("batchId", batchId);
      return apiFetch<PriceHistoryPage>(
        `/inventory/pricing/history?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!token,
  });

  const rows = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  const hasFilters = searchQuery || fieldFilter || dateFrom || dateTo || batchId;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setFieldFilter("");
    setDateFrom("");
    setDateTo("");
    setBatchId("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Search products..."
              className="h-8 w-52 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="relative">
            <select
              value={fieldFilter}
              onChange={(event) => setFieldFilter(event.target.value as "" | "COST_PRICE" | "SELL_PRICE")}
              className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="">All Types</option>
              <option value="COST_PRICE">Cost Only</option>
              <option value="SELL_PRICE">Sell Only</option>
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>

          <DateRangePicker
            startDate={dateFrom}
            endDate={dateTo}
            onChange={(start, end) => {
              setDateFrom(start);
              setDateTo(end);
            }}
          />

          <input
            type="text"
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
            placeholder="Batch ID..."
            className="h-8 w-36 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
          />

          {hasFilters && (
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

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">
            Failed to load price history
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <History size={32} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {hasFilters ? "No history matches your filters" : "No price changes recorded yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasFilters
                ? "Try broadening your search criteria."
                : "Price changes will appear here as they are made."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Date</th>
                <th className="px-4 py-1.5 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Type</th>
                <th className="whitespace-nowrap px-4 py-1.5 text-right font-medium">Old</th>
                <th className="whitespace-nowrap px-4 py-1.5 text-right font-medium">New</th>
                <th className="whitespace-nowrap px-4 py-1.5 text-right font-medium">Change</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Source</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, idx) => {
                const changedAt = row.changedAt ? new Date(row.changedAt) : new Date();
                const dateStr = changedAt.toLocaleDateString("en-PH", { day: "2-digit", month: "short" });
                const timeStr = changedAt.toLocaleTimeString("en-PH", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                const pct = Number(row.pctChange) || 0;
                const isSell = row.field === "SELL_PRICE";
                const SOURCE_STYLES: Record<string, string> = {
                  manual: "bg-muted text-muted-foreground",
                  margin_alert: "bg-amber-500/10 text-amber-600",
                  bulk_update: "bg-blue-500/10 text-blue-600",
                  po_received: "bg-emerald-500/10 text-emerald-600",
                  dead_stock_clearance: "bg-red-500/10 text-red-600",
                  import: "bg-violet-500/10 text-violet-600",
                };

                return (
                  <tr key={row.id ?? idx} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-1.5">
                      <div className="text-xs text-foreground">{dateStr}</div>
                      <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-sm font-medium text-foreground">{row.productName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">SKU: {row.productSku}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5">
                      <span
                        className={cn(
                          "inline-block rounded px-2 py-0.5 text-[10px] font-semibold",
                          isSell ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600",
                        )}
                      >
                        {isSell ? "Sell" : "Cost"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                      {"\u20B1"}{fmtCurrency(row.oldValue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right text-xs font-medium tabular-nums">
                      {"\u20B1"}{fmtCurrency(row.newValue)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-4 py-1.5 text-right text-xs font-semibold tabular-nums",
                        pct > 0 ? "text-emerald-600" : pct < 0 ? "text-red-500" : "text-muted-foreground",
                      )}
                    >
                      {pct > 0 ? "\u2191+" : pct < 0 ? "\u2193" : ""}
                      {fmtPct(pct)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold",
                          SOURCE_STYLES[row.source] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {row.source?.replace(/_/g, " ") ?? "manual"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-xs text-muted-foreground">
                      {row.changedByName ?? "System"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length} entr{rows.length !== 1 ? "ies" : "y"}
            {hasFilters ? " (filtered)" : ""}
          </span>
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
        </div>
      </div>
    </div>
  );
}
