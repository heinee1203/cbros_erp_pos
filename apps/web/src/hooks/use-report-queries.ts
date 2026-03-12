"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types (mirror backend service.ts) ──

export interface JobCardMargin {
  jobCardId: string;
  jobNo: string;
  locationId: string;
  technicianId: string | null;
  status: string;
  invoicedAt: string | null;
  laborRevenue: string;
  totalLaborHours: string;
  laborLineCount: number;
  partsRevenue: string;
  netPartsIssued: number;
  partsLineCount: number;
  partsCogs: string;
  totalRevenue: string;
  grossProfit: string;
  grossMarginPct: string;
  partsMarkupPct: string;
}

export interface TechnicianEfficiency {
  technicianId: string;
  technicianName: string;
  jobsCompleted: number;
  totalActiveWorkHours: string;
  avgActiveHoursPerJob: string;
  totalPartsWaitHours: string;
  totalBayQueueHours: string;
  avgTurnaroundHours: string;
  estimateAccuracyRatio: string | null;
  efficiencyPct: string | null;
}

export interface ServiceHistoryEntry {
  jobCardId: string;
  jobNo: string;
  status: string;
  locationName: string;
  customerName: string;
  customerPhone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehiclePlate: string | null;
  odometerReading: number | null;
  totalLaborRevenue: string;
  totalPartsRevenue: string;
  grandTotal: string;
  createdAt: string;
  checkedInAt: string | null;
  completedAt: string | null;
  invoicedAt: string | null;
  closedAt: string | null;
}

export interface KPISummary {
  totalJobCards: number;
  completedJobCards: number;
  cancelledJobCards: number;
  avgGrossMarginPct: string;
  totalLaborRevenue: string;
  totalPartsRevenue: string;
  totalPartsCogs: string;
  totalGrossProfit: string;
  avgActiveWorkHours: string;
  avgTurnaroundHours: string;
}

// ── Filter interface ──

export interface ReportFilters {
  from?: string;
  to?: string;
  allLocations?: boolean;
}

// ── Query parameter builder ──

function buildReportParams(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.allLocations) params.set("allLocations", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ── KPI Summary ──

export function useKPISummaryQuery(
  token: string,
  locationId: string,
  filters: ReportFilters = {},
) {
  return useQuery<KPISummary>({
    queryKey: ["reports-kpi-summary", filters.from, filters.to, filters.allLocations, locationId],
    queryFn: () =>
      apiFetch<KPISummary>(
        `/reports/kpi-summary${buildReportParams(filters)}`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}

// ── Job Card Margins (paginated list) ──

export function useJobCardMarginsQuery(
  token: string,
  locationId: string,
  filters: ReportFilters & { cursor?: string; limit?: number } = {},
) {
  return useQuery<{ data: JobCardMargin[]; nextCursor: string | null; hasMore: boolean }>({
    queryKey: [
      "reports-job-margins",
      filters.from,
      filters.to,
      filters.allLocations,
      filters.cursor,
      locationId,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.allLocations) params.set("allLocations", "true");
      if (filters.cursor) params.set("cursor", filters.cursor);
      if (filters.limit) params.set("limit", String(filters.limit));
      const qs = params.toString();
      return apiFetch<{ data: JobCardMargin[]; nextCursor: string | null; hasMore: boolean }>(
        `/reports/job-margins${qs ? `?${qs}` : ""}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}

// ── Single Job Card Margin Detail ──

export function useJobCardMarginDetailQuery(
  jobCardId: string,
  token: string,
  locationId: string,
) {
  return useQuery<JobCardMargin>({
    queryKey: ["reports-job-margin-detail", jobCardId],
    queryFn: () =>
      apiFetch<JobCardMargin>(
        `/reports/job-margins/${jobCardId}`,
        { token, locationId },
      ),
    enabled: !!jobCardId && !!token && !!locationId,
    staleTime: 60_000,
  });
}

// ── Technician Efficiency ──

export function useTechnicianEfficiencyQuery(
  token: string,
  locationId: string,
  filters: ReportFilters = {},
) {
  return useQuery<{ data: TechnicianEfficiency[] }>({
    queryKey: [
      "reports-technician-efficiency",
      filters.from,
      filters.to,
      filters.allLocations,
      locationId,
    ],
    queryFn: () =>
      apiFetch<{ data: TechnicianEfficiency[] }>(
        `/reports/technician-efficiency${buildReportParams(filters)}`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}

// ── Service History by Vehicle ──

export function useServiceHistoryByVehicleQuery(
  vehicleId: string,
  token: string,
  locationId: string,
) {
  return useQuery<{ data: ServiceHistoryEntry[] }>({
    queryKey: ["reports-service-history-vehicle", vehicleId],
    queryFn: () =>
      apiFetch<{ data: ServiceHistoryEntry[] }>(
        `/reports/service-history/vehicle/${vehicleId}`,
        { token, locationId },
      ),
    enabled: !!vehicleId && !!token && !!locationId,
    staleTime: 60_000,
  });
}

// ── Service History by Customer ──

export function useServiceHistoryByCustomerQuery(
  customerId: string,
  token: string,
  locationId: string,
) {
  return useQuery<{ data: ServiceHistoryEntry[] }>({
    queryKey: ["reports-service-history-customer", customerId],
    queryFn: () =>
      apiFetch<{ data: ServiceHistoryEntry[] }>(
        `/reports/service-history/customer/${customerId}`,
        { token, locationId },
      ),
    enabled: !!customerId && !!token && !!locationId,
    staleTime: 60_000,
  });
}
