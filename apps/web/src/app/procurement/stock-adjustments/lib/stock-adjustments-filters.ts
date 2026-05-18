type StockAdjustmentsFilterState = {
  allLocations: boolean;
  dateFrom: string;
  dateTo: string;
  debouncedSearch: string;
  directionFilter: "all" | "IN" | "OUT";
  reasonFilter: string;
};

export function buildStockJournalFilters({
  allLocations,
  dateFrom,
  dateTo,
  debouncedSearch,
  directionFilter,
  reasonFilter,
}: StockAdjustmentsFilterState) {
  return {
    allLocations,
    referenceType: "ADJUSTMENT" as const,
    search: debouncedSearch || undefined,
    direction: directionFilter !== "all" ? directionFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    reasonCode: reasonFilter !== "all" ? reasonFilter : undefined,
  };
}

export function hasActiveStockAdjustmentFilters({
  dateFrom,
  dateTo,
  directionFilter,
  reasonFilter,
  searchQuery,
}: Omit<StockAdjustmentsFilterState, "allLocations" | "debouncedSearch"> & {
  searchQuery: string;
}) {
  return (
    directionFilter !== "all" ||
    reasonFilter !== "all" ||
    searchQuery !== "" ||
    dateFrom !== "" ||
    dateTo !== ""
  );
}
