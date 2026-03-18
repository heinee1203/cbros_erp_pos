"use client";

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface ReorderSuggestionRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  supplierId: string | null;
  supplierName: string | null;
  currentStock: number;
  pendingInbound: number;
  avgDailyDemand: string;
  demandStdDev: string;
  avgLeadTime: string;
  serviceLevelZ: string;
  safetyStock: string;
  reorderPoint: string;
  suggestedQty: number;
  targetStock: number;
  abcClass: string;
  priority: string;
  status: string;
  notes: string | null;
  computedAt: string;
  brandName: string | null;
  categoryName: string | null;
}

export interface ReorderSummary {
  critical: number;
  urgent: number;
  normal: number;
  totalValue: number;
}

export interface ReorderCounts {
  critical: number;
  urgent: number;
  normal: number;
  total: number;
}

interface ReorderPage {
  data: ReorderSuggestionRow[];
  summary: ReorderSummary;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ReorderFilters {
  search?: string;
  priority?: string;
  supplierId?: string;
  brandId?: string;
  categoryId?: string;
  sortBy?: string;
  sortDir?: string;
}

// ── Hooks ──

export function useReorderSuggestions(
  token: string | null,
  locationId: string,
  filters: ReorderFilters = {},
  limit = 50,
) {
  return useInfiniteQuery<ReorderPage>({
    queryKey: ["reorder", filters, limit],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam as string);
      if (filters.search) params.set("search", filters.search);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.supplierId) params.set("supplierId", filters.supplierId);
      if (filters.brandId) params.set("brandId", filters.brandId);
      if (filters.categoryId) params.set("categoryId", filters.categoryId);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortDir) params.set("sortDir", filters.sortDir);

      return apiFetch<ReorderPage>(
        `/inventory/reorder?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!token,
  });
}

export function useReorderRefresh(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch("/inventory/reorder/refresh", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder"] });
    },
  });
}

export function useReorderCounts(token: string | null, locationId: string) {
  return useQuery<ReorderCounts>({
    queryKey: ["reorder-counts"],
    queryFn: () =>
      apiFetch<ReorderCounts>("/inventory/reorder/counts", {
        token: token!,
        locationId,
      }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useReorderDismiss(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/inventory/reorder/${id}/dismiss`, {
        method: "PATCH",
        token: token!,
        locationId,
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder"] });
    },
  });
}

export function useReorderUpdateQty(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      apiFetch(`/inventory/reorder/${id}/qty`, {
        method: "PATCH",
        token: token!,
        locationId,
        body: JSON.stringify({ suggestedQty: qty }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder"] });
    },
  });
}

export function useReorderCreatePOs(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionIds: string[]) =>
      apiFetch<{ poNumbers: string[] }>("/inventory/reorder/create-pos", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({ suggestionIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder"] });
    },
  });
}

export function useReorderSettings(token: string | null, locationId: string) {
  return useQuery({
    queryKey: ["reorder-settings"],
    queryFn: () =>
      apiFetch("/inventory/reorder/settings", {
        token: token!,
        locationId,
      }),
    enabled: !!token,
  });
}

export function useUpdateReorderSettings(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      apiFetch("/inventory/reorder/settings", {
        method: "PATCH",
        token: token!,
        locationId,
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder-settings"] });
    },
  });
}
