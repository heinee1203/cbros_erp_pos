"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useBrands(token: string, locationId: string, search?: string) {
  const params = new URLSearchParams();
  if (search && search.length >= 2) params.set("search", search);
  const qs = params.toString();

  return useQuery<{ data: Brand[] }>({
    queryKey: ["brands", search],
    queryFn: () =>
      apiFetch<{ data: Brand[] }>(`/brands${qs ? `?${qs}` : ""}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}

export function useCreateBrand(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, slug }: { name: string; slug: string }) =>
      apiFetch<Brand>("/brands", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ name, slug }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
  });
}

export function useUpdateBrand(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; slug?: string; isActive?: boolean }) =>
      apiFetch<Brand>(`/brands/${id}`, {
        token,
        locationId,
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
  });
}

export function useDeleteBrand(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/brands/${id}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
  });
}
