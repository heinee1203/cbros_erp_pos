"use client";

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface CountSessionRow {
  id: string;
  locationId: string;
  locationName: string;
  label: string;
  status: string;
  scope: string;
  scopeFilter: string | null;
  notes: string | null;
  totalLines: number;
  countedLines: number;
  varianceLines: number;
  createdByName: string | null;
  reviewedByName: string | null;
  postedByName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CountSessionsPage {
  data: CountSessionRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CountLineRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  mnemonicSku: string;
  category: string;
  familyName: string | null;
  inventoryId: string;
  systemQty: number;
  countedQty: number | null;
  variance: number | null;
  countedByName: string | null;
  countedAt: string | null;
  notes: string | null;
}

export interface CountDetailResponse {
  session: CountSessionRow;
  lines: CountLineRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CountListFilters {
  allLocations?: boolean;
  status?: string;
  search?: string;
}

// ── List hook (paginated) ──

export function useCountSessions(
  token: string,
  locationId: string,
  filters: CountListFilters = {},
  limit = 50,
) {
  return useInfiniteQuery<CountSessionsPage>({
    queryKey: [
      "inventory-counts",
      filters.allLocations,
      filters.status,
      filters.search,
      locationId,
      limit,
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam as string);
      if (filters.allLocations) params.set("allLocations", "true");
      if (filters.status) params.set("status", filters.status);
      if (filters.search && filters.search.length >= 2)
        params.set("search", filters.search);

      return apiFetch<CountSessionsPage>(
        `/inventory/counts?${params.toString()}`,
        { token, locationId },
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!token && !!locationId,
    staleTime: 15_000,
  });
}

// ── Detail hook (single session with lines) ──

export interface CountDetailFilters {
  search?: string;
  varianceOnly?: boolean;
  uncountedOnly?: boolean;
}

export function useCountDetail(
  token: string,
  locationId: string,
  countId: string,
  filters: CountDetailFilters = {},
  limit = 100,
) {
  return useInfiniteQuery<CountDetailResponse>({
    queryKey: [
      "inventory-count-detail",
      countId,
      filters.search,
      filters.varianceOnly,
      filters.uncountedOnly,
      limit,
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam as string);
      if (filters.search && filters.search.length >= 2)
        params.set("search", filters.search);
      if (filters.varianceOnly) params.set("varianceOnly", "true");
      if (filters.uncountedOnly) params.set("uncountedOnly", "true");

      return apiFetch<CountDetailResponse>(
        `/inventory/counts/${countId}?${params.toString()}`,
        { token, locationId },
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!token && !!locationId && !!countId,
    staleTime: 10_000,
  });
}

// ── Mutations ──

export function useCreateCount(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      countType: string;
      title?: string;
      notes?: string;
      filterCriteria?: {
        familyId?: string;
        categoryId?: string;
        subcategoryId?: string;
        brandId?: string;
      };
    }) =>
      apiFetch<{ id: string; totalLines: number; label: string; status: string }>(
        "/inventory/counts",
        {
          method: "POST",
          body: JSON.stringify(input),
          token,
          locationId,
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
    },
  });
}

export function useRecordCountLine(
  token: string,
  locationId: string,
  countId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      lineId: string;
      countedQty: number;
      notes?: string;
    }) =>
      apiFetch<{ lineId: string; countedQty: number; variance: number }>(
        `/inventory/counts/${countId}/lines/${input.lineId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            countedQty: input.countedQty,
            notes: input.notes,
          }),
          token,
          locationId,
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-count-detail", countId] });
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
    },
  });
}

export function useCountTransition(
  token: string,
  locationId: string,
  countId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "complete" | "review" | "cancel" | "post") => {
      const body =
        action === "post"
          ? JSON.stringify({ idempotencyKey: crypto.randomUUID() })
          : undefined;
      return apiFetch<{ id: string; status: string }>(
        `/inventory/counts/${countId}/${action}`,
        {
          method: "POST",
          body,
          token,
          locationId,
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-count-detail", countId] });
      qc.invalidateQueries({ queryKey: ["inventory-counts"] });
      qc.invalidateQueries({ queryKey: ["stock-journal"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}
