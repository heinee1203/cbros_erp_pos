"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface SubcategoryRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useSubcategories(
  token: string,
  locationId: string,
  categoryId?: string,
) {
  return useQuery<{ data: SubcategoryRow[] }>({
    queryKey: ["subcategories", categoryId, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      return apiFetch(`/subcategories?${params.toString()}`, { token, locationId });
    },
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

export function useCreateSubcategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      categoryId: string;
      name: string;
      slug: string;
      sortOrder?: number;
      isActive?: boolean;
    }) =>
      apiFetch("/subcategories", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subcategories"] }),
  });
}

export function useUpdateSubcategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; slug?: string; sortOrder?: number; isActive?: boolean }) =>
      apiFetch(`/subcategories/${id}`, {
        token,
        locationId,
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subcategories"] }),
  });
}

export function useDeleteSubcategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/subcategories/${id}`, { token, locationId, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subcategories"] }),
  });
}
