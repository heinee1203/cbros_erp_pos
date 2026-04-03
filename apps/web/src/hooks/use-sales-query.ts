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
  employeeId?: string;
  filterLocationId?: string;
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
      if (filters.employeeId) params.set("employeeId", filters.employeeId);
      if (filters.filterLocationId) params.set("locationId", filters.filterLocationId);
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

// ── Historical Sales (Imported from Loyverse Receipts CSV) ──

export interface HistoricalSaleItem {
  id: string;
  sku: string;
  productName: string;
  productId: string | null;
  locationName: string;
  employeeName: string | null;
  reasonType: string;
  reasonReference: string | null;
  quantity: number;
  direction: string;
  movementDate: string;
  source: "imported";
}

interface HistoricalSalesResponse {
  data: HistoricalSaleItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useHistoricalSalesQuery(
  token: string,
  locationId: string,
  filters: { from?: string; to?: string; q?: string; cursor?: string; limit?: number } = {},
) {
  return useQuery<HistoricalSalesResponse>({
    queryKey: ["sales", "history", filters, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.q) params.set("q", filters.q);
      if (filters.cursor) params.set("cursor", filters.cursor);
      if (filters.limit) params.set("limit", String(filters.limit));
      const qs = params.toString();
      return apiFetch<HistoricalSalesResponse>(
        `/sales/history${qs ? `?${qs}` : ""}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

// ── Historical Receipts (aggregated by receipt number) ──

export interface HistoricalReceiptItem {
  receiptNumber: string;
  date: string;
  store: string;
  cashier: string | null;
  customerName: string | null;
  type: string;
  lineCount: number;
  totalQty: number;
  receiptTotal: number;
  source: "imported";
}

interface HistoricalReceiptsResponse {
  data: HistoricalReceiptItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useHistoricalReceiptsQuery(
  token: string,
  locationId: string,
  filters: { from?: string; to?: string; q?: string; filterLocationId?: string; employeeName?: string; cursor?: string; limit?: number } = {},
) {
  return useQuery<HistoricalReceiptsResponse>({
    queryKey: ["sales", "history-receipts", filters, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.q) params.set("q", filters.q);
      if (filters.filterLocationId) params.set("locationId", filters.filterLocationId);
      if (filters.employeeName) params.set("employeeName", filters.employeeName);
      if (filters.cursor) params.set("cursor", filters.cursor);
      if (filters.limit) params.set("limit", String(filters.limit));
      const qs = params.toString();
      return apiFetch<HistoricalReceiptsResponse>(
        `/sales/history/receipts${qs ? `?${qs}` : ""}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}
