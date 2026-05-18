"use client";

import { useCallback, useMemo, useState } from "react";

import {
  useCountDetail,
  useCountTransition,
  useRecordCountLine,
  type CountDetailFilters,
} from "@/hooks/use-inventory-counts";
import { useDebouncedSearch } from "./use-debounced-search";

type UseCountDetailControllerArgs = {
  countId: string;
  locationId: string;
  token: string;
};

export function useCountDetailController({
  countId,
  locationId,
  token,
}: UseCountDetailControllerArgs) {
  const {
    debouncedSearch: debouncedLineSearch,
    handleSearchChange: handleLineSearch,
    searchQuery: lineSearch,
  } = useDebouncedSearch();
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [uncountedOnly, setUncountedOnly] = useState(false);

  const filters: CountDetailFilters = {
    search: debouncedLineSearch || undefined,
    varianceOnly,
    uncountedOnly,
  };

  const query = useCountDetail(token, locationId, countId, filters);
  const session = query.data?.pages[0]?.session ?? null;
  const lines = useMemo(
    () => query.data?.pages.flatMap((page) => page.lines) ?? [],
    [query.data],
  );

  const recordMutation = useRecordCountLine(token, locationId, countId);
  const transitionMutation = useCountTransition(token, locationId, countId);

  const isEditable =
    session?.status === "DRAFT" || session?.status === "IN_PROGRESS";
  const progress =
    session && session.totalLines > 0
      ? Math.round((session.countedLines / session.totalLines) * 100)
      : 0;

  const handleRecordCount = useCallback(
    (lineId: string, countedQty: number) => {
      recordMutation.mutate({ lineId, countedQty });
    },
    [recordMutation],
  );

  const toggleVarianceOnly = useCallback(() => {
    setVarianceOnly((previous) => {
      const next = !previous;
      if (next) setUncountedOnly(false);
      return next;
    });
  }, []);

  const toggleUncountedOnly = useCallback(() => {
    setUncountedOnly((previous) => {
      const next = !previous;
      if (next) setVarianceOnly(false);
      return next;
    });
  }, []);

  return {
    cancelCount: () => transitionMutation.mutate("cancel"),
    completeCount: () => transitionMutation.mutate("complete"),
    debouncedLineSearch,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    handleLineSearch,
    handleRecordCount,
    hasNextPage: query.hasNextPage,
    isEditable,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    lineSearch,
    lines,
    postCount: () => transitionMutation.mutate("post"),
    progress,
    reviewCount: () => transitionMutation.mutate("review"),
    session,
    toggleUncountedOnly,
    toggleVarianceOnly,
    transitionPending: transitionMutation.isPending,
    uncountedOnly,
    varianceOnly,
  };
}

export type CountDetailController = ReturnType<typeof useCountDetailController>;
