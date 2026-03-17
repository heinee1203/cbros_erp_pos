"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type GroupByLevel = "family" | "category" | "brand" | "vehicleMake";

export interface FamilyCountRow {
  id: string | null;
  name: string;
  itemCount: number;
  categoryCount: number;
}

export interface CategoryCountRow {
  id: string | null;
  name: string;
  color: string | null;
  itemCount: number;
  brandCount: number;
}

export interface BrandCountRow {
  id: string | null;
  name: string;
  itemCount: number;
  makeCount: number;
}

export interface MakeCountRow {
  make: string;
  itemCount: number;
}

export interface GroupedCountsFilters {
  familyId?: string;
  categoryId?: string;
  brandId?: string;
  stockStatus?: string;
  allLocations?: boolean;
}

export function useGroupedCounts<T>(
  token: string,
  locationId: string,
  groupBy: GroupByLevel,
  filters?: GroupedCountsFilters,
  options?: { enabled?: boolean },
) {
  const params = new URLSearchParams({ groupBy });
  if (filters?.familyId) params.set("familyId", filters.familyId);
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.brandId) params.set("brandId", filters.brandId);
  if (filters?.stockStatus) params.set("stockStatus", filters.stockStatus);
  if (filters?.allLocations) params.set("allLocations", "true");

  return useQuery<{ data: T[] }>({
    queryKey: ["grouped-counts", locationId, groupBy, filters ?? null],
    queryFn: () =>
      apiFetch<{ data: T[] }>(
        `/products/grouped-counts?${params.toString()}`,
        { token, locationId },
      ),
    enabled: (options?.enabled ?? true) && !!token && !!locationId,
    staleTime: 30_000,
  });
}
