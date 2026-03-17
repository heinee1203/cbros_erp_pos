"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: string | null;
  familyId: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoriesResponse {
  data: CategoryRow[];
}

export interface CategoryListFilters {
  search?: string;
  activeOnly?: boolean;
}

// ── List hook ──

export function useCategories(
  token: string,
  locationId: string,
  filters: CategoryListFilters = {},
) {
  return useQuery<CategoriesResponse>({
    queryKey: [
      "categories",
      filters.search,
      filters.activeOnly,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search && filters.search.length >= 2)
        params.set("search", filters.search);
      if (filters.activeOnly) params.set("activeOnly", "true");

      const qs = params.toString();
      return apiFetch<CategoriesResponse>(
        `/categories${qs ? `?${qs}` : ""}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

// ── Create mutation ──

export function useCreateCategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      slug: string;
      code?: string;
      description?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
      parentId?: string;
      familyId?: string;
    }) =>
      apiFetch<CategoryRow>("/categories", {
        method: "POST",
        body: JSON.stringify(input),
        token,
        locationId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// ── Update mutation ──

export function useUpdateCategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      categoryId: string;
      name?: string;
      slug?: string;
      description?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
      parentId?: string | null;
    }) => {
      const { categoryId, ...body } = input;
      return apiFetch<CategoryRow>(`/categories/${categoryId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        token,
        locationId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// ── Delete mutation ──

export function useDeleteCategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiFetch<void>(`/categories/${categoryId}`, {
        method: "DELETE",
        token,
        locationId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
