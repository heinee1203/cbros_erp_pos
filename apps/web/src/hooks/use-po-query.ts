"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface POLocation {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface POSupplier {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  mnemonicCode: string | null;
}

export interface POLine {
  id: string;
  productId: string;
  orderedQty: number;
  receivedAcceptedQty: number;
  rejectedQty: number;
  unitCost: string;
  createdAt: string;
  productName: string;
  sku: string;
  mnemonicSku: string;
  category: string;
  barcode: string | null;
  unitPrice: string;
  mnemonicCostCode: string | null;
}

export interface POReceiptEvent {
  id: string;
  purchaseOrderId: string;
  poLineId: string;
  productId: string;
  locationId: string;
  receivedAcceptedQty: number;
  rejectedQty: number;
  unitCost: string;
  notes: string | null;
  receivedByUserId: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface PODetail {
  id: string;
  orgId: string;
  poNo: string;
  supplierId: string;
  destinationLocationId: string;
  status: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  createdByUserId: string;
  submittedByUserId: string | null;
  cancelledByUserId: string | null;
  closedByUserId: string | null;
  submittedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: POSupplier;
  destination: POLocation;
  lines: POLine[];
  receiptEvents: POReceiptEvent[];
}

// ── Hook ──

/**
 * Fetch a PO by its public PO number.
 *
 * Cache key: ["po", poNo]
 * Refetches when poNo or locationId changes.
 */
export function usePOQuery(
  poNo: string,
  token: string,
  locationId: string,
) {
  return useQuery<PODetail>({
    queryKey: ["po", poNo, locationId],
    queryFn: () =>
      apiFetch<PODetail>(
        `/procurement/purchase-orders/by-number/${encodeURIComponent(poNo)}`,
        { token, locationId },
      ),
    enabled: !!poNo && !!token && !!locationId,
    staleTime: 15_000,
  });
}

// ── Receipt Batch Types ──

export interface POReceiptLine {
  productName: string;
  sku: string;
  mnemonicSku: string;
  acceptedQty: number;
  rejectedQty: number;
  unitCost: string;
  notes: string | null;
}

export interface POReceipt {
  id: string;
  supplierDrNo: string;
  lineCount: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;
  receivedBy: string;
  notes: string | null;
  createdAt: string;
  lines: POReceiptLine[];
}

/**
 * Fetch receipt batches for a PO, grouped by DR number.
 */
export function usePOReceipts(
  poId: string,
  token: string,
  locationId: string,
) {
  return useQuery<{ data: POReceipt[] }>({
    queryKey: ["po-receipts", poId],
    queryFn: () =>
      apiFetch<{ data: POReceipt[] }>(
        `/procurement/purchase-orders/${poId}/receipts`,
        { token, locationId },
      ),
    enabled: !!poId && !!token && !!locationId,
    staleTime: 15_000,
  });
}
