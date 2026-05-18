"use client";

import { useMemo, useState } from "react";

import {
  useCountSessions,
  type CountListFilters,
} from "@/hooks/use-inventory-counts";
import { useDebouncedSearch } from "./use-debounced-search";

type UseCountListControllerArgs = {
  locationId: string;
  token: string;
};

export function useCountListController({
  locationId,
  token,
}: UseCountListControllerArgs) {
  const [allLocations, setAllLocations] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const {
    clearSearch,
    debouncedSearch,
    handleSearchChange,
    searchQuery,
  } = useDebouncedSearch();

  const filters: CountListFilters = {
    allLocations,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: debouncedSearch || undefined,
  };

  const query = useCountSessions(token, locationId, filters);

  const sessions = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  const hasFilters = statusFilter !== "all" || searchQuery !== "";

  function clearFilters() {
    setStatusFilter("all");
    clearSearch();
  }

  return {
    allLocations,
    clearFilters,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    handleSearchChange,
    hasFilters,
    hasNextPage: query.hasNextPage,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    searchQuery,
    sessions,
    setAllLocations,
    setStatusFilter,
    statusFilter,
  };
}

export type CountListController = ReturnType<typeof useCountListController>;
