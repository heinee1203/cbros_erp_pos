"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface ProductLocationRow {
  inventoryId: string | null;
  locationId: string;
  locationName: string;
  locationType: string;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  optimalStock: number;
  availableForSale: boolean;
}

interface ProductLocationsResponse {
  data: ProductLocationRow[];
}

// ── Fetch hook ──

export function useProductLocations(
  token: string,
  locationId: string,
  productId: string | null,
) {
  return useQuery<ProductLocationsResponse>({
    queryKey: ["product-locations", productId],
    queryFn: () =>
      apiFetch<ProductLocationsResponse>(
        `/inventory/stock-levels/product/${productId}/locations`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!productId,
    staleTime: 10_000,
  });
}

// ── Toggle mutation ──

export function useToggleAvailability(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      productId: string;
      updates: Array<{ locationId: string; availableForSale: boolean }>;
    }) =>
      apiFetch<{ success: boolean }>("/inventory/stock-levels/availability", {
        method: "PATCH",
        body: JSON.stringify(input),
        token,
        locationId,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ["product-locations", variables.productId],
      });
    },
  });
}
