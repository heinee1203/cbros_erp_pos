"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface TransferLocation {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface TransferItem {
  id: string;
  transferId: string;
  productId: string;
  requestedQty: number;
  dispatchedQty: number;
  receivedQty: number;
  varianceQty: number;
  mnemonicSku: string;
  productName: string;
  sku: string;
  remainingReceivable: number;
  remainingDispatchable: number;
  createdAt: string;
}

export interface TransferReceipt {
  id: string;
  transferItemId: string;
  receivedQty: number;
  notes: string | null;
  receivedByUserId: string;
  createdAt: string;
}

export interface TransferDetail {
  id: string;
  orgId: string;
  transferNo: string;
  sourceLocationId: string;
  destinationLocationId: string;
  status: string;
  notes: string | null;
  requestedByUserId: string;
  approvedByUserId: string | null;
  dispatchedByUserId: string | null;
  receivedByUserId: string | null;
  approvedAt: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceLocation: TransferLocation;
  destinationLocation: TransferLocation;
  items: TransferItem[];
  receipts: TransferReceipt[];
  allowedActions: string[];
  actionLabels: Record<string, string>;
}

// ── Hook ──

/**
 * Fetch a transfer by its public transfer number.
 *
 * Cache key: ["transfer", transferNo]
 * Refetches when transferNo or locationId changes.
 * locationId change = location context switch → refetch to recompute allowedActions.
 */
export function useTransferQuery(
  transferNo: string,
  token: string,
  locationId: string,
) {
  return useQuery<TransferDetail>({
    queryKey: ["transfer", transferNo, locationId],
    queryFn: () =>
      apiFetch<TransferDetail>(
        `/transfers/by-number/${encodeURIComponent(transferNo)}`,
        { token, locationId },
      ),
    enabled: !!transferNo && !!token && !!locationId,
    staleTime: 15_000, // 15s — shorter for transfer detail (active workflow)
  });
}
