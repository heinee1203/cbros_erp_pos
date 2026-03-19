"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ReturnRow {
  id: string;
  returnNumber: string;
  originalSaleId: string;
  saleNo: string;
  customerName: string | null;
  locationName: string;
  status: "DRAFT" | "COMPLETED" | "VOIDED";
  returnReason: string;
  total: string;
  refundMethod: string;
  lineCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ReturnDetail extends ReturnRow {
  reasonNotes: string | null;
  subtotal: string;
  taxAmount: string;
  refundReference: string | null;
  approvedByName: string | null;
  processedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
  lines: ReturnLineRow[];
}

export interface ReturnLineRow {
  id: string;
  originalSaleLineId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  condition: string;
  restock: boolean;
  restockLocationName: string | null;
  notes: string | null;
}

export function useReturns(token: string | null, locationId: string, filters?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ["returns", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.search) params.set("search", filters.search);
      params.set("limit", "50");
      return apiFetch<{ data: ReturnRow[]; nextCursor: string | null }>(`/returns?${params}`, { token: token!, locationId });
    },
    enabled: !!token,
  });
}

export function useReturnDetail(token: string | null, locationId: string, returnId: string) {
  return useQuery({
    queryKey: ["return", returnId],
    queryFn: () => apiFetch<ReturnDetail>(`/returns/${returnId}`, { token: token!, locationId }),
    enabled: !!token && !!returnId,
  });
}

export function useCreateReturn(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiFetch<ReturnDetail>("/returns", { method: "POST", token: token!, locationId, body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["returns"] }),
  });
}

export function useCompleteReturn(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ returnId, approvalPin }: { returnId: string; approvalPin: string }) =>
      apiFetch(`/returns/${returnId}/complete`, { method: "POST", token: token!, locationId, body: JSON.stringify({ approvalPin }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["return"] });
    },
  });
}

export function useVoidReturn(token: string | null, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ returnId, reason }: { returnId: string; reason: string }) =>
      apiFetch(`/returns/${returnId}/void`, { method: "POST", token: token!, locationId, body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["return"] });
    },
  });
}
