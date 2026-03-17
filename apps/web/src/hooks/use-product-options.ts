"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface OptionValueRow {
  id: string;
  value: string;
  sortOrder: number;
}

export interface OptionTypeRow {
  id: string;
  name: string;
  sortOrder: number;
  values: OptionValueRow[];
}

export function useProductOptions(token: string, locationId: string, productId?: string) {
  return useQuery<{ data: OptionTypeRow[] }>({
    queryKey: ["product-options", productId],
    queryFn: () => apiFetch(`/product-options/${productId}`, { token, locationId }),
    enabled: !!token && !!locationId && !!productId,
    staleTime: 30_000,
  });
}

export function useCreateOptionType(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, name, values }: { productId: string; name: string; values: string[] }) =>
      apiFetch(`/product-options/${productId}`, {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ name, values }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["product-options", vars.productId] });
      qc.invalidateQueries({ queryKey: ["product-detail", vars.productId] });
    },
  });
}

export function useDeleteOptionType(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, typeId }: { productId: string; typeId: string }) =>
      apiFetch(`/product-options/${productId}/types/${typeId}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["product-options", vars.productId] }),
  });
}

export function useAddOptionValue(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, typeId, value }: { productId: string; typeId: string; value: string }) =>
      apiFetch(`/product-options/${productId}/types/${typeId}/values`, {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ value }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["product-options", vars.productId] }),
  });
}

export function useDeleteOptionValue(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, typeId, valueId }: { productId: string; typeId: string; valueId: string }) =>
      apiFetch(`/product-options/${productId}/types/${typeId}/values/${valueId}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["product-options", vars.productId] }),
  });
}
