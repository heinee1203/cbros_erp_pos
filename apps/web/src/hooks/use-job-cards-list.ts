"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface JobCardListItem {
  id: string;
  jobNo: string;
  status: string;
  locationId: string;
  customerId: string;
  customerVehicleId: string | null;
  assignedTechnicianUserId: string | null;
  createdAt: string;
  updatedAt: string;
  customerName: string;
}

export interface JobCardsListResponse {
  data: JobCardListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useJobCardsList(token: string, locationId: string) {
  return useQuery<JobCardsListResponse>({
    queryKey: ["job-cards", "list", locationId],
    queryFn: () =>
      apiFetch<JobCardsListResponse>("/job-cards?limit=100", {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 15_000,
  });
}
