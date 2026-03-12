"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface JournalEntry {
  id: string;
  effectiveAt: string;
  productId: string;
  productName: string;
  productSku: string;
  mnemonicSku: string;
  locationId: string;
  locationName: string;
  locationType: string;
  changeQuantity: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  referenceLineId: string | null;
  reasonCode: string | null;
  notes: string | null;
  actorType: string;
  actorName: string | null;
  reversalOfJournalId: string | null;
  createdAt: string;
}

export interface JournalPage {
  data: JournalEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface JournalFilters {
  allLocations?: boolean;
  locationId?: string;
  search?: string;
  referenceType?: string;
  direction?: "IN" | "OUT";
  dateFrom?: string;
  dateTo?: string;
  reasonCode?: string;
  productId?: string;
}

// ── Hook ──

/**
 * Shared stock journal infinite query hook.
 *
 * Reusable for:
 *  - Inventory History page (all reference types)
 *  - Stock Adjustments history (referenceType = "ADJUSTMENT")
 *  - Product detail movement timelines (productId filter)
 */
export function useStockJournal(
  token: string,
  locationId: string,
  filters: JournalFilters = {},
  limit = 50,
) {
  return useInfiniteQuery<JournalPage>({
    queryKey: [
      "stock-journal",
      filters.allLocations,
      filters.locationId,
      filters.search,
      filters.referenceType,
      filters.direction,
      filters.dateFrom,
      filters.dateTo,
      filters.reasonCode,
      filters.productId,
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
      if (filters.referenceType) params.set("referenceType", filters.referenceType);
      if (filters.direction) params.set("direction", filters.direction);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.reasonCode) params.set("reasonCode", filters.reasonCode);
      if (filters.productId) params.set("productId", filters.productId);

      return apiFetch<JournalPage>(
        `/inventory/journal?${params.toString()}`,
        { token, locationId },
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}
