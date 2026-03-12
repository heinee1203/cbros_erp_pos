"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface SaleListItem {
  id: string;
  saleNo: string;
  status: string;
  locationId: string;
  customerId: string | null;
  grandTotal: string;
  subtotal: string;
  discountTotal: string;
  createdAt: string;
  completedAt: string | null;
  customerName: string | null;
  locationName: string;
  employeeName: string;
  lineCount: number;
}

export interface SalesFilters {
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  allLocations?: boolean;
}

interface SalesListResponse {
  data: SaleListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useSalesListQuery(
  token: string,
  locationId: string,
  filters: SalesFilters = {},
) {
  return useQuery<SalesListResponse>({
    queryKey: ["sales", "list", filters, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.q) params.set("q", filters.q);
      if (filters.cursor) params.set("cursor", filters.cursor);
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.allLocations) params.set("allLocations", "true");
      const qs = params.toString();

      return apiFetch<SalesListResponse>(
        `/sales${qs ? `?${qs}` : ""}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 15_000,
  });
}
