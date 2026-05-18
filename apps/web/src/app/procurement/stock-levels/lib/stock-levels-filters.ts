import type {
  SortDir,
  SortField,
  StockLevelsFilters,
} from "@/hooks/use-stock-levels";

type StockLevelsFilterState = {
  allLocations: boolean;
  belowReorder: boolean;
  categoryFilter: string;
  debouncedSearch: string;
  familyFilter: string;
  sortBy: SortField;
  sortDir: SortDir;
  stockStatusFilter: string;
  subcategoryFilter: string;
};

type ActiveFilterState = {
  belowReorder: boolean;
  categoryFilter: string;
  familyFilter: string;
  searchQuery: string;
  stockStatusFilter: string;
  subcategoryFilter: string;
};

function activeValue(value: string): string | undefined {
  return value !== "all" ? value : undefined;
}

function activeStockStatus(
  value: string,
): StockLevelsFilters["stockStatus"] | undefined {
  return value !== "all" ? (value as StockLevelsFilters["stockStatus"]) : undefined;
}

export function buildLocationStockLevelsFilters({
  allLocations,
  belowReorder,
  categoryFilter,
  debouncedSearch,
  sortBy,
  sortDir,
  stockStatusFilter,
}: StockLevelsFilterState): StockLevelsFilters {
  return {
    allLocations,
    search: debouncedSearch || undefined,
    category: activeValue(categoryFilter),
    stockStatus: activeStockStatus(stockStatusFilter),
    belowReorder: belowReorder || undefined,
    sortBy,
    sortDir,
  };
}

export function buildProductStockLevelsFilters({
  belowReorder,
  categoryFilter,
  debouncedSearch,
  familyFilter,
  sortBy,
  sortDir,
  stockStatusFilter,
  subcategoryFilter,
}: StockLevelsFilterState): StockLevelsFilters {
  return {
    search: debouncedSearch || undefined,
    familyId: activeValue(familyFilter),
    categoryId: activeValue(categoryFilter),
    subcategoryId: activeValue(subcategoryFilter),
    stockStatus: activeStockStatus(stockStatusFilter),
    belowReorder: belowReorder || undefined,
    sortBy,
    sortDir,
  };
}

export function hasActiveStockLevelsFilters({
  belowReorder,
  categoryFilter,
  familyFilter,
  searchQuery,
  stockStatusFilter,
  subcategoryFilter,
}: ActiveFilterState): boolean {
  return (
    familyFilter !== "all" ||
    categoryFilter !== "all" ||
    subcategoryFilter !== "all" ||
    stockStatusFilter !== "all" ||
    searchQuery !== "" ||
    belowReorder
  );
}
