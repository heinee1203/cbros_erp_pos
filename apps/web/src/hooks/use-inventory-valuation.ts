"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ── Types ── */
export interface ValuationGroup {
  groupName: string;
  skuCount: number;
  totalUnits: number;
  costValue: number;
  retailValue: number;
  marginPct: number;
  pctOfTotal: number;
  topCategories?: string;
}

export interface ValuationTotals {
  skuCount: number;
  totalUnits: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
  avgMarginPct: number;
  adjustedMarginPct: number;
  adjustedRetailValue: number;
  adjustedCostValue: number;
  zeroCostCount: number;
  zeroSellCount: number;
}

export interface ValuationResponse {
  totals: ValuationTotals;
  groups: ValuationGroup[];
}

export interface ValuationDetailProduct {
  productId: string;
  productName: string;
  sku: string;
  stock: number;
  costPrice: number;
  sellPrice: number;
  costValue: number;
  retailValue: number;
  marginPct: number;
}

export interface ValuationDetailResponse {
  products: ValuationDetailProduct[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type GroupByOption = "category" | "brand" | "family" | "location";

export interface ValuationFilterOptions {
  groupBy: GroupByOption;
  filterLocationId?: string;
  categoryId?: string;
  brandId?: string;
  excludeZeroCost?: boolean;
  excludeZeroSell?: boolean;
}

/* ── Hooks ── */
export function useInventoryValuation(
  token: string,
  locationId: string,
  options: ValuationFilterOptions = { groupBy: "category" },
) {
  const params = new URLSearchParams();
  params.set("allLocations", "true");
  params.set("groupBy", options.groupBy);
  if (options.filterLocationId) params.set("locationId", options.filterLocationId);
  if (options.categoryId) params.set("categoryId", options.categoryId);
  if (options.brandId) params.set("brandId", options.brandId);
  if (options.excludeZeroCost) params.set("excludeZeroCost", "true");
  if (options.excludeZeroSell) params.set("excludeZeroSell", "true");

  return useQuery<ValuationResponse>({
    queryKey: ["inventory-valuation", options.groupBy, options.filterLocationId, options.categoryId, options.brandId, options.excludeZeroCost, options.excludeZeroSell, locationId],
    queryFn: () =>
      apiFetch<ValuationResponse>(`/reports/inventory-valuation?${params.toString()}`, {
        token,
        locationId,
      }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useInventoryValuationDetail(
  token: string,
  locationId: string,
  options: {
    groupBy: GroupByOption;
    groupName: string;
    filterLocationId?: string;
    categoryId?: string;
    brandId?: string;
    excludeZeroCost?: boolean;
    excludeZeroSell?: boolean;
    enabled?: boolean;
  },
) {
  const params = new URLSearchParams();
  params.set("allLocations", "true");
  params.set("groupBy", options.groupBy);
  params.set("groupName", options.groupName);
  params.set("limit", "50");
  if (options.filterLocationId) params.set("locationId", options.filterLocationId);
  if (options.categoryId) params.set("categoryId", options.categoryId);
  if (options.brandId) params.set("brandId", options.brandId);
  if (options.excludeZeroCost) params.set("excludeZeroCost", "true");
  if (options.excludeZeroSell) params.set("excludeZeroSell", "true");

  return useQuery<ValuationDetailResponse>({
    queryKey: ["inventory-valuation-detail", options.groupBy, options.groupName, options.filterLocationId, options.categoryId, options.brandId, options.excludeZeroCost, options.excludeZeroSell, locationId],
    queryFn: () =>
      apiFetch<ValuationDetailResponse>(`/reports/inventory-valuation/detail?${params.toString()}`, {
        token,
        locationId,
      }),
    enabled: !!token && (options.enabled !== false),
    staleTime: 60_000,
  });
}
