"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  category: string;
  unitPrice: string;   // numeric string from Postgres
  costPrice: string;   // numeric string from Postgres
  barcode: string | null;
  isVariablePrice: boolean;
  stockLevel: number;
  reorderPoint: number;
  familyId: string | null;
  familyName: string | null;
}

export interface ProductsResponse {
  data: ProductRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  grouped?: boolean;
}

export type SortField =
  | "name"
  | "sku"
  | "category"
  | "unitPrice"
  | "stockLevel";

export type SortDir = "asc" | "desc";

export interface ProductListFilters {
  search?: string;
  category?: string;
  stockStatus?: string;  // "low" | "out" | ""
  sortBy?: SortField;
  sortDir?: SortDir;
  page?: number;
  limit?: number;
  grouped?: boolean;
}

/* ─────────────────────────────────────────────
 * Hook
 * ───────────────────────────────────────────── */

export function useProducts(
  token: string,
  locationId: string,
  filters: ProductListFilters = {},
) {
  const {
    search,
    category,
    stockStatus,
    sortBy = "name",
    sortDir = "asc",
    page = 1,
    limit = 50,
    grouped = false,
  } = filters;

  return useQuery<ProductsResponse>({
    queryKey: [
      "products",
      locationId,
      search,
      category,
      stockStatus,
      sortBy,
      sortDir,
      page,
      limit,
      grouped,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

      if (search && search.length >= 2) params.set("search", search);
      if (category) params.set("category", category);
      if (stockStatus) params.set("stockStatus", stockStatus);
      if (grouped) params.set("grouped", "true");

      return apiFetch<ProductsResponse>(
        `/products?${params.toString()}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,  // keep previous data while refetching
  });
}

/* ─────────────────────────────────────────────
 * Create Product Mutation
 * ───────────────────────────────────────────── */

export interface CreateProductPayload {
  name: string;
  sku: string;
  mnemonicSku: string;
  category: string;
  unitPrice?: string;
  costPrice?: string;
  barcode?: string;
  familyId?: string | null;
  description?: string;
  trackInventory?: boolean;
  reorderPoint?: number;
  leadTimeDays?: number;
  initialStock?: number;
  locationIds?: string[];
  vehicleCompatibility?: {
    make: string;
    model: string;
    yearStart: number;
    yearEnd: number;
    engine?: string;
    notes?: string;
  }[];
}

export function useCreateProduct(token: string, locationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateProductPayload) => {
      return apiFetch<ProductRow>("/products", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/* ─────────────────────────────────────────────
 * Product Families
 * ───────────────────────────────────────────── */

export interface ProductFamily {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export function useProductFamilies(token: string, locationId: string) {
  return useQuery<{ data: ProductFamily[] }>({
    queryKey: ["product-families"],
    queryFn: () =>
      apiFetch<{ data: ProductFamily[] }>("/products/families", {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}
