"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth-context";
import { useStockJournal } from "@/hooks/use-stock-journal";
import {
  buildStockJournalFilters,
  hasActiveStockAdjustmentFilters,
} from "./stock-adjustments-filters";
import { useDebouncedSearch } from "./use-debounced-search";

export function useStockAdjustmentsController() {
  const { token, locationId, locations, loading: authLoading } = useAuth();

  const [allLocations, setAllLocations] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<"all" | "IN" | "OUT">("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const {
    clearSearch,
    debouncedSearch,
    handleSearchChange,
    searchQuery,
  } = useDebouncedSearch();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const query = useStockJournal(token, locationId, buildStockJournalFilters({
    allLocations,
    dateFrom,
    dateTo,
    debouncedSearch,
    directionFilter,
    reasonFilter,
  }));

  const entries = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  const hasActiveFilters = hasActiveStockAdjustmentFilters({
    dateFrom,
    dateTo,
    directionFilter,
    reasonFilter,
    searchQuery,
  });

  function setDateRange(start: string, end: string) {
    setDateFrom(start);
    setDateTo(end);
  }

  function clearFilters() {
    setDirectionFilter("all");
    setReasonFilter("all");
    clearSearch();
    setDateFrom("");
    setDateTo("");
  }

  return {
    allLocations,
    authLoading,
    clearFilters,
    dateFrom,
    dateTo,
    directionFilter,
    drawerOpen,
    entries,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    handleSearchChange,
    hasActiveFilters,
    hasNextPage: query.hasNextPage,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    locationId,
    locations,
    reasonFilter,
    searchQuery,
    setAllLocations,
    setDateRange,
    setDirectionFilter,
    setDrawerOpen,
    setReasonFilter,
    token,
    totalCount: entries.length,
  };
}

export type StockAdjustmentsController = ReturnType<typeof useStockAdjustmentsController>;
