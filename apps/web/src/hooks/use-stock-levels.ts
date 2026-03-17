"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface StockLevelRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  mnemonicSku: string;
  category: string;
  familyName: string | null;
  locationId: string;
  locationName: string;
  locationType: string;
  stockLevel: number;
  reservedLevel: number;
  available: number;
  reorderPoint: number;
  leadTimeDays: number;
  status: "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
  updatedAt: string;
}

export interface StockLevelsSummary {
  totalSkus: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  belowReorder: number;
  totalReserved: number;
}

export interface StockLevelsPage {
  data: StockLevelRow[];
  summary: StockLevelsSummary;
  nextCursor: string | null;
  hasMore: boolean;
}

export type SortField =
  | "name"
  | "sku"
  | "category"
  | "location"
  | "stockLevel"
  | "reservedLevel"
  | "available"
  | "reorderPoint"
  | "status";

export type SortDir = "asc" | "desc";

export interface StockLevelsFilters {
  allLocations?: boolean;
  locationId?: string;
  search?: string;
  category?: string;
  stockStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  belowReorder?: boolean;
  sortBy?: SortField;
  sortDir?: SortDir;
}

// ── Hook ──

/**
 * Shared stock levels infinite query hook.
 *
 * Reusable for:
 *  - Stock Levels monitoring page
 *  - Low-stock alerts / dashboard widgets
 *  - Replenishment planning views
 */
export function useStockLevels(
  token: string,
  locationId: string,
  filters: StockLevelsFilters = {},
  limit = 50,
) {
  return useInfiniteQuery<StockLevelsPage>({
    queryKey: [
      "stock-levels",
      filters.allLocations,
      filters.locationId,
      filters.search,
      filters.category,
      filters.stockStatus,
      filters.belowReorder,
      filters.sortBy,
      filters.sortDir,
      locationId,
      limit,
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));

      if (pageParam) params.set("cursor", pageParam as string);
      if (filters.allLocations) params.set("allLocations", "true");
      if (filters.locationId) params.set("locationId", filters.locationId);
      if (filters.search && filters.search.length >= 2) params.set("search", filters.search);
      if (filters.category) params.set("category", filters.category);
      if (filters.stockStatus) params.set("stockStatus", filters.stockStatus);
      if (filters.belowReorder) params.set("belowReorder", "true");
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortDir) params.set("sortDir", filters.sortDir);

      return apiFetch<StockLevelsPage>(
        `/inventory/stock-levels?${params.toString()}`,
        { token, locationId },
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}
