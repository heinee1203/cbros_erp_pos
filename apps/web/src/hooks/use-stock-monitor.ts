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
  subcategoryName: string | null;
  familyName: string | null;
  totalStock: number;
  specialOrder: boolean;
  discontinued: boolean;
  avgDailySales30d: string;
  avgDailySales60d: string;
  avgDailySales90d: string;
  avgDailySales180d: string;
  avgDailySales365d: string;
  avgDailySalesAll: string;
  trend: string;
  trendRecent: string;
  trendPrior: string;
  daysOfStock: string | null;
  stockoutDays90d: number;
  lastPoDate: string | null;
  lastPoSupplierName: string | null;
  lastLeadTimeDays: number | null;
  lastSaleDate: string | null;
  saleDaysCount: number;
  totalQtySold: number;
  daysSinceLastSale: number | null;
  velocityClass: string;
  avgSellingPrice: string | null;
  stockAgeMonths: number | null;
  suggestedSellPrice: string | null;
  appliedMarkupPct: string | null;
  inflationAdjustedCost: string | null;
  costPrice: string | null;
  sold12m: number;
  sold6m: number;
  sold3m: number;
  sold1m: number;
  avgMonth12m: string;
  avgMonth6m: string;
  avgMonth3m: string;
  avgMonth1m: string;
  monthsLeft12m: string | null;
  monthsLeft6m: string | null;
  monthsLeft3m: string | null;
  monthsLeft1m: string | null;
  velocityTrend: string | null;
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
  fastMovers: number;
  strategicStock: number;
  watchList: number;
  deadStockVelocity: number;
  newItems: number;
  deadStockValue: number;
  computedAt: string | null;
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
  subcategoryId?: string;
  familyId?: string;
  hideNegativeStock?: boolean;
  hideDiscontinued?: boolean;
  hideSpecialOrder?: boolean;
  urgency?: string;
  lastSoldAfter?: string;
  lastSoldBefore?: string;
  urgencyWindow?: string;
  velocityClass?: string;
  urgencyAll?: string;
  urgency12m?: string;
  urgency6m?: string;
  urgency3m?: string;
  urgency1m?: string;
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
      if (filters.subcategoryId) params.set("subcategoryId", filters.subcategoryId);
      if (filters.familyId) params.set("familyId", filters.familyId);
      if (filters.hideNegativeStock) params.set("hideNegativeStock", "true");
      if (filters.hideDiscontinued) params.set("hideDiscontinued", "true");
      if (filters.hideSpecialOrder) params.set("hideSpecialOrder", "true");
      if (filters.urgency) params.set("urgency", filters.urgency);
      if (filters.urgencyWindow) params.set("urgencyWindow", filters.urgencyWindow);
      if (filters.velocityClass) params.set("velocityClass", filters.velocityClass);
      if (filters.urgencyAll) params.set("urgencyAll", filters.urgencyAll);
      if (filters.urgency12m) params.set("urgency12m", filters.urgency12m);
      if (filters.urgency6m) params.set("urgency6m", filters.urgency6m);
      if (filters.urgency3m) params.set("urgency3m", filters.urgency3m);
      if (filters.urgency1m) params.set("urgency1m", filters.urgency1m);
      if (filters.lastSoldAfter) params.set("lastSoldAfter", filters.lastSoldAfter);
      if (filters.lastSoldBefore) params.set("lastSoldBefore", filters.lastSoldBefore);
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
