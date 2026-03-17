"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface VariantRow {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  unitPrice: string;
  costPrice: string;
  barcode: string | null;
  isVariablePrice: boolean;
  isActive: boolean;
  options: Array<{ typeName: string; value: string }>;
  stockLevel: number;
}

export function useVariants(token: string, locationId: string, parentId?: string) {
  return useQuery<{ data: VariantRow[] }>({
    queryKey: ["variants", parentId, locationId],
    queryFn: () => apiFetch(`/variants/${parentId}`, { token, locationId }),
    enabled: !!token && !!locationId && !!parentId,
    staleTime: 30_000,
  });
}

export function useCreateVariant(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      parentId,
      ...input
    }: {
      parentId: string;
      sku: string;
      mnemonicSku?: string;
      unitPrice?: string;
      costPrice?: string;
      barcode?: string;
      isVariablePrice?: boolean;
      optionValueIds: string[];
    }) =>
      apiFetch(`/variants/${parentId}`, {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.parentId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCreateVariantBatch(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      parentId,
      variants,
    }: {
      parentId: string;
      variants: Array<{
        sku: string;
        name?: string;
        mnemonicSku?: string;
        unitPrice?: string;
        costPrice?: string;
        optionValueIds: string[];
      }>;
    }) =>
      apiFetch(`/variants/${parentId}/batch`, {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ variants }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.parentId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteVariant(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, variantId }: { parentId: string; variantId: string }) =>
      apiFetch(`/variants/${parentId}/${variantId}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.parentId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateVariant(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, parentId, ...payload }: { variantId: string; parentId: string; name?: string; unitPrice?: string; costPrice?: string }) =>
      apiFetch(`/products/${variantId}`, {
        token,
        locationId,
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.parentId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useConvertToRegular(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId }: { productId: string }) =>
      apiFetch(`/variants/${productId}/convert-to-regular`, {
        token,
        locationId,
        method: "POST",
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.productId] });
      qc.invalidateQueries({ queryKey: ["product-options", vars.productId] });
      qc.invalidateQueries({ queryKey: ["product-detail", vars.productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
