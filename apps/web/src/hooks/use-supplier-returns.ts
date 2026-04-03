"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface SupplierReturnRow {
  id: string;
  rtvNo: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  status: string;
  reason: string;
  lineCount: number;
  totalCost: string;
  creditAmount: string | null;
  creditType: string | null;
  sourcePOId: string | null;
  sourcePONo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierReturnLineRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  mnemonicSku: string;
  quantity: number;
  condition: string;
  costPerUnit: string;
  lineTotal: string;
  notes: string | null;
}

export interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedByUserId: string | null;
  changedByName: string | null;
  notes: string | null;
  createdAt: string | null;
}

export interface SupplierReturnDetail extends SupplierReturnRow {
  notes: string | null;
  creditReference: string | null;
  createdByUserId: string;
  createdByName: string;
  lines: SupplierReturnLineRow[];
  statusHistory: StatusHistoryEntry[];
}

// ── List Hook ──

interface SupplierReturnFilters {
  status?: string;
  supplierId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export function useSupplierReturns(
  token: string,
  locationId: string,
  filters?: SupplierReturnFilters,
) {
  return useQuery<{ data: SupplierReturnRow[]; nextCursor: string | null }>({
    queryKey: ["supplier-returns", locationId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.supplierId) params.set("supplierId", filters.supplierId);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.cursor) params.set("cursor", filters.cursor);
      params.set("limit", String(filters?.limit ?? 50));
      return apiFetch<{ data: SupplierReturnRow[]; nextCursor: string | null }>(
        `/procurement/supplier-returns?${params}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 15_000,
  });
}

// ── Detail Hook ──

export function useSupplierReturnDetail(
  token: string,
  locationId: string,
  rtvId: string,
) {
  return useQuery<SupplierReturnDetail>({
    queryKey: ["supplier-return", rtvId],
    queryFn: () =>
      apiFetch<SupplierReturnDetail>(
        `/procurement/supplier-returns/${rtvId}`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!rtvId,
    staleTime: 10_000,
  });
}

// ── Create Mutation ──

export interface CreateSupplierReturnPayload {
  supplierId: string;
  locationId: string;
  reason: string;
  sourcePOId?: string;
  notes?: string;
  idempotencyKey: string;
  lines: {
    productId: string;
    quantity: number;
    costPrice: string;
    condition: string;
    notes?: string;
  }[];
}

export function useCreateSupplierReturn(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSupplierReturnPayload) =>
      apiFetch<SupplierReturnDetail>("/procurement/supplier-returns", {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-returns"] });
    },
  });
}

// ── Generic Action Mutation (status transitions) ──

interface SupplierReturnActionInput {
  rtvId: string;
  action: "submit" | "acknowledge" | "receive-credit" | "close" | "close-without-credit" | "cancel";
  body?: Record<string, unknown>;
}

export function useSupplierReturnAction(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rtvId, action, body }: SupplierReturnActionInput) =>
      apiFetch(`/procurement/supplier-returns/${rtvId}/${action}`, {
        method: "POST",
        token,
        locationId,
        body: body ? JSON.stringify(body) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-returns"] });
      qc.invalidateQueries({ queryKey: ["supplier-return"] });
    },
  });
}

export function useDeleteSupplierReturn(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rtvId: string) =>
      apiFetch(`/procurement/supplier-returns/${rtvId}`, {
        method: "DELETE",
        token,
        locationId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-returns"] });
    },
  });
}
