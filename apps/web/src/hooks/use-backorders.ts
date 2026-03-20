"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface BackorderItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  supplier_id: string;
  supplier_name: string;
  quantity: number;
  original_po_id: string | null;
  original_po_number: string | null;
  reason: string | null;
  priority: "HIGH" | "NORMAL" | "LOW";
  status: "PENDING" | "INCLUDED_IN_PO" | "CANCELLED";
  target_po_id: string | null;
  target_po_number: string | null;
  needed_by_date: string | null;
  notes: string | null;
  days_pending: number;
  created_at: string;
  resolved_at: string | null;
}

export interface BackorderSummary {
  pendingTotal: number;
  suppliersWithPending: number;
  oldestPendingDays: number;
  neededThisWeek: number;
}

export interface SupplierGroup {
  supplier_id: string;
  supplier_name: string;
  pending_count: number;
  total_quantity: number;
  oldest_backorder: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    originalPoNumber: string | null;
    priority: string;
    neededByDate: string | null;
    daysPending: number;
    createdAt: string;
    reason: string | null;
    notes: string | null;
  }>;
}

interface BackorderListResponse {
  data: BackorderItem[];
  summary: BackorderSummary;
  nextCursor: string | null;
  hasMore: boolean;
}

interface BackordersBySupplierResponse {
  suppliers: SupplierGroup[];
}

// ── Hooks ──

export function useBackorders(
  token: string | null,
  locationId: string,
  status?: string,
) {
  return useQuery<BackorderListResponse>({
    queryKey: ["backorders", status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status && status !== "ALL") params.set("status", status);
      params.set("limit", "200");
      return apiFetch<BackorderListResponse>(
        `/procurement/backorders?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    enabled: !!token,
  });
}

export function useBackordersBySupplier(
  token: string | null,
  locationId: string,
) {
  return useQuery<BackordersBySupplierResponse>({
    queryKey: ["backorders-by-supplier"],
    queryFn: () =>
      apiFetch<BackordersBySupplierResponse>(
        "/procurement/backorders/by-supplier",
        { token: token!, locationId },
      ),
    enabled: !!token,
  });
}

export function useBackorderSummary(
  token: string | null,
  locationId: string,
) {
  return useQuery<BackorderSummary>({
    queryKey: ["backorder-summary"],
    queryFn: () =>
      apiFetch<BackorderSummary>("/procurement/backorders/summary", {
        token: token!,
        locationId,
      }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useBackorderCount(
  token: string | null,
  locationId: string,
) {
  return useQuery<{ count: number }>({
    queryKey: ["backorder-count"],
    queryFn: () =>
      apiFetch<{ count: number }>("/procurement/backorders/count", {
        token: token!,
        locationId,
      }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useCreateBackorder(
  token: string | null,
  locationId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      productId: string;
      supplierId: string;
      quantity: number;
      originalPoId?: string;
      originalPoNumber?: string;
      reason?: string;
      priority?: string;
      neededByDate?: string;
      notes?: string;
    }) =>
      apiFetch("/procurement/backorders", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backorders"] });
      qc.invalidateQueries({ queryKey: ["backorders-by-supplier"] });
      qc.invalidateQueries({ queryKey: ["backorder-summary"] });
      qc.invalidateQueries({ queryKey: ["backorder-count"] });
    },
  });
}

export function useCreateBackordersBulk(
  token: string | null,
  locationId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Array<{
      productId: string;
      supplierId: string;
      quantity: number;
      originalPoId?: string;
      originalPoNumber?: string;
      reason?: string;
      priority?: string;
      neededByDate?: string;
    }>) =>
      apiFetch("/procurement/backorders/bulk", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backorders"] });
      qc.invalidateQueries({ queryKey: ["backorders-by-supplier"] });
      qc.invalidateQueries({ queryKey: ["backorder-summary"] });
      qc.invalidateQueries({ queryKey: ["backorder-count"] });
    },
  });
}

export function useUpdateBackorder(
  token: string | null,
  locationId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string;
      priority?: string;
      neededByDate?: string | null;
      notes?: string | null;
      quantity?: number;
    }) =>
      apiFetch(`/procurement/backorders/${id}`, {
        method: "PATCH",
        token: token!,
        locationId,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backorders"] });
      qc.invalidateQueries({ queryKey: ["backorders-by-supplier"] });
      qc.invalidateQueries({ queryKey: ["backorder-summary"] });
    },
  });
}

export function useCancelBackorder(
  token: string | null,
  locationId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch(`/procurement/backorders/${id}/cancel`, {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backorders"] });
      qc.invalidateQueries({ queryKey: ["backorders-by-supplier"] });
      qc.invalidateQueries({ queryKey: ["backorder-summary"] });
      qc.invalidateQueries({ queryKey: ["backorder-count"] });
    },
  });
}

export function useIncludeInPO(
  token: string | null,
  locationId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      backorderIds: string[];
      targetPoId: string;
      targetPoNumber: string;
    }) =>
      apiFetch("/procurement/backorders/include-in-po", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backorders"] });
      qc.invalidateQueries({ queryKey: ["backorders-by-supplier"] });
      qc.invalidateQueries({ queryKey: ["backorder-summary"] });
      qc.invalidateQueries({ queryKey: ["backorder-count"] });
    },
  });
}
