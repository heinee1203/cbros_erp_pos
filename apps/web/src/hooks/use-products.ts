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
  vehicleModel: string | null;
  stockLevel: number;
  reorderPoint: number;
  familyId: string | null;
  familyName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  parentProductId: string | null;
  isParent: boolean;
  oemNumber: string | null;
  unitsPerCase: number;
  packagingUnit: string | null;
  primarySupplierId: string | null;
  reorderEnabled: boolean;
  customReorderPoint: number | null;
  isSerialized: boolean;
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
  | "costPrice"
  | "stockLevel"
  | "categoryName"
  | "brandName"
  | "margin";

export type SortDir = "asc" | "desc";

export interface ProductListFilters {
  search?: string;
  familyId?: string;
  category?: string;
  stockStatus?: string;  // "low" | "out" | ""
  subCategoryId?: string;
  subcategoryId?: string;
  brandId?: string;
  vehicleMake?: string;
  sortBy?: SortField;
  sortDir?: SortDir;
  page?: number;
  limit?: number;
  grouped?: boolean;
  parentOnly?: boolean;
  allLocations?: boolean;
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
    familyId,
    category,
    stockStatus,
    subCategoryId,
    subcategoryId,
    brandId,
    vehicleMake,
    sortBy = "name",
    sortDir = "asc",
    page = 1,
    limit = 50,
    grouped = false,
    parentOnly = false,
    allLocations = false,
  } = filters;

  return useQuery<ProductsResponse>({
    queryKey: [
      "products",
      locationId,
      search,
      familyId,
      category,
      stockStatus,
      subCategoryId,
      subcategoryId,
      brandId,
      vehicleMake,
      sortBy,
      sortDir,
      page,
      limit,
      grouped,
      parentOnly,
      allLocations,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

      if (search && search.length >= 2) params.set("search", search);
      if (familyId) params.set("familyId", familyId);
      if (category) params.set("category", category);
      if (stockStatus) params.set("stockStatus", stockStatus);
      if (subCategoryId) params.set("subCategoryId", subCategoryId);
      if (subcategoryId) params.set("subcategoryId", subcategoryId);
      if (brandId) params.set("brandId", brandId);
      if (vehicleMake) params.set("vehicleMake", vehicleMake);
      if (grouped) params.set("grouped", "true");
      if (parentOnly) params.set("parentOnly", "true");
      if (allLocations) params.set("allLocations", "true");

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
  mnemonicSku?: string;
  category: string;
  unitPrice?: string;
  costPrice?: string;
  barcode?: string;
  familyId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  brandId?: string | null;
  description?: string;
  trackInventory?: boolean;
  reorderPoint?: number;
  optimalStock?: number;
  leadTimeDays?: number;
  initialStock?: number;
  locationIds?: string[];
  oemNumber?: string;
  isParent?: boolean;
  unitsPerCase?: number;
  packagingUnit?: string;
  primarySupplierId?: string | null;
  isSerialized?: boolean;
  vehicleCompatibility?: {
    make: string;
    model: string;
    yearStart: number;
    yearEnd: number;
    engine?: string;
    notes?: string;
  }[];
  variants?: {
    suffix: string;
    sku: string;
    unitPrice: string;
    costPrice: string;
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
 * Update Product Mutation
 * ───────────────────────────────────────────── */

export interface UpdateProductPayload {
  name?: string;
  unitPrice?: string;
  costPrice?: string;
  barcode?: string;
  familyId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  brandId?: string | null;
  reorderPoint?: number;
  unitsPerCase?: number;
  packagingUnit?: string | null;
  primarySupplierId?: string | null;
  reorderEnabled?: boolean;
  customReorderPoint?: number | null;
  isSerialized?: boolean;
}

export function useUpdateProduct(token: string, locationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateProductPayload & { id: string }) => {
      return apiFetch<ProductRow>(`/products/${id}`, {
        token,
        locationId,
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/* ─────────────────────────────────────────────
 * Product Detail (single product by ID)
 * ───────────────────────────────────────────── */

export interface ProductDetail extends ProductRow {
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  oemNumber: string | null;
  vehicleCompatibility: {
    id: string;
    make: string;
    model: string;
    yearStart: number;
    yearEnd: number;
    engine: string | null;
    notes: string | null;
  }[];
}

export function useProductDetail(token: string, locationId: string, productId: string | null) {
  return useQuery<ProductDetail>({
    queryKey: ["product-detail", productId],
    queryFn: () =>
      apiFetch<ProductDetail>(`/products/${productId}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId && !!productId,
    staleTime: 30_000,
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

/* ─────────────────────────────────────────────
 * Delete Product Mutation
 * ───────────────────────────────────────────── */

export function useDeleteProduct(token: string, locationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) =>
      apiFetch(`/products/${productId}`, {
        method: "DELETE",
        token,
        locationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["grouped-counts"] });
    },
  });
}
