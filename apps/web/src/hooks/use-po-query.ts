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
