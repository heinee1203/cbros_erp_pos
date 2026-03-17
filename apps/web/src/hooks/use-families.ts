"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

export interface FamilyDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  productCount: number;
}

export interface FamilyProduct {
  id: string;
  name: string;
  sku: string;
  unitPrice: string;
  costPrice: string;
  stockLevel: number;
  barcode: string | null;
}

/* ─────────────────────────────────────────────
 * Hooks
 * ───────────────────────────────────────────── */

export function useFamilyDetail(token: string, locationId: string, slug: string) {
  return useQuery<FamilyDetail>({
    queryKey: ["family-detail", slug],
    queryFn: () =>
      apiFetch<FamilyDetail>(`/products/families/${slug}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId && !!slug,
    staleTime: 30_000,
  });
}

export function useFamilyProducts(token: string, locationId: string, slug: string, search?: string) {
  const params = new URLSearchParams();
  if (search && search.length >= 2) params.set("search", search);
  const qs = params.toString();

  return useQuery<{ data: FamilyProduct[] }>({
    queryKey: ["family-products", slug, search],
    queryFn: () =>
      apiFetch<{ data: FamilyProduct[] }>(`/products/families/${slug}/products${qs ? `?${qs}` : ""}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId && !!slug,
    staleTime: 30_000,
  });
}

export function useCreateFamily(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: { name: string }) =>
      apiFetch<{ id: string; name: string; slug: string }>("/products/families", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-families"] });
    },
  });
}

export function useUpdateFamily(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<{ id: string; name: string; slug: string }>(`/products/families/${id}`, {
        token,
        locationId,
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-families"] });
      qc.invalidateQueries({ queryKey: ["family-detail"] });
    },
  });
}

export function useDeleteFamily(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/products/families/${id}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-families"] });
    },
  });
}
