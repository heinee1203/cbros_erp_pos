"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface StockMonitorRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  familyName: string | null;
  totalStock: number;
  avgDailySales30d: string;
  avgDailySales60d: string;
  avgDailySales90d: string;
  daysOfStock: string | null;
  stockoutDays90d: number;
  lastPoDate: string | null;
  lastPoSupplierName: string | null;
  lastLeadTimeDays: number | null;
  sellingUnit: string;
  purchaseUnit: string | null;
  conversionFactor: string;
  status: string;
  computedAt: string;
}

export interface StockMonitorSummary {
  critical: number;
  low: number;
  healthy: number;
  overstock: number;
  deadStock: number;
  outOfStock: number;
  total: number;
}

interface StockMonitorPage {
  data: StockMonitorRow[];
  summary: StockMonitorSummary;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SupplierMetricsRow {
  id: string;
  supplierId: string;
  supplierName: string;
  poCount6m: number;
  avgLeadTimeDays: string | null;
  minLeadTimeDays: number | null;
  maxLeadTimeDays: number | null;
  reliabilityPct: string | null;
  lastPoDate: string | null;
  computedAt: string;
}

interface SupplierMetricsPage {
  data: SupplierMetricsRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StockMonitorFilters {
  search?: string;
  status?: string;
  brandId?: string;
  categoryId?: string;
  familyId?: string;
  sortBy?: string;
  sortDir?: string;
}

// ── Hooks ──

export function useStockMonitor(
  token: string | null,
  locationId: string,
  filters: StockMonitorFilters = {},
  limit = 50,
) {
  return useInfiniteQuery<StockMonitorPage>({
    queryKey: ["stock-monitor", filters, limit],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam as string);
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.brandId) params.set("brandId", filters.brandId);
      if (filters.categoryId) params.set("categoryId", filters.categoryId);
      if (filters.familyId) params.set("familyId", filters.familyId);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortDir) params.set("sortDir", filters.sortDir);

      return apiFetch<StockMonitorPage>(
        `/inventory/stock-monitor?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!token,
  });
}

export function useStockMonitorRefresh(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch("/inventory/stock-monitor/refresh", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-monitor"] });
      qc.invalidateQueries({ queryKey: ["supplier-metrics"] });
    },
  });
}

export function useSupplierMetrics(
  token: string | null,
  locationId: string,
  filters: { search?: string; sortBy?: string; sortDir?: string } = {},
  limit = 50,
) {
  return useInfiniteQuery<SupplierMetricsPage>({
    queryKey: ["supplier-metrics", filters, limit],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam as string);
      if (filters.search) params.set("search", filters.search);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortDir) params.set("sortDir", filters.sortDir);

      return apiFetch<SupplierMetricsPage>(
        `/inventory/stock-monitor/suppliers?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!token,
  });
}
