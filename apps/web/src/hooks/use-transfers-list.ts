"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface TransferListItem {
  id: string;
  transferNo: string;
  status: string;
  sourceLocationName: string;
  destinationLocationName: string;
  createdAt: string;
  lineCount?: number;
}

export interface TransfersListResponse {
  data: TransferListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useTransfersList(token: string, locationId: string) {
  return useQuery<TransfersListResponse>({
    queryKey: ["transfers", "list", locationId],
    queryFn: () =>
      apiFetch<TransfersListResponse>("/transfers?limit=100", {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 15_000,
  });
}
