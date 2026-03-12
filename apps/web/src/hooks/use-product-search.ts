"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  category: string;
  unitPrice: string;
  costPrice: string;
  barcode: string | null;
  stockLevel: number;
  reorderPoint: number;
}

interface ProductSearchResponse {
  data: ProductSearchResult[];
}

/**
 * Trigram fuzzy product search — calls GET /products/search?q=...
 * Only fires when query is at least 2 characters.
 */
export function useProductSearch(
  token: string,
  locationId: string,
  query: string,
) {
  const trimmed = query.trim();

  return useQuery<ProductSearchResponse>({
    queryKey: ["products", "search", locationId, trimmed],
    queryFn: () =>
      apiFetch<ProductSearchResponse>(
        `/products/search?q=${encodeURIComponent(trimmed)}`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && trimmed.length >= 2,
    staleTime: 10_000,
  });
}
