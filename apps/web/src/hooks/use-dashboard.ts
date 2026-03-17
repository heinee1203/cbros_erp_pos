"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ─── Types ─── */

export interface DashboardScope {
  locationId: string;
  locationName: string;
  isAllLocations: boolean;
}

export interface InventorySummary {
  totalSkus: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  belowReorder: number;
  totalReserved: number;
}

export interface ProcurementSummary {
  openPOs: number;
  draftPOs: number;
  awaitingReceiving: number;
}

export interface TransferSummary {
  openTransfers: number;
  inTransit: number;
  awaitingApproval: number;
}

export interface JobCardSummary {
  activeJobs: number;
  waitingForParts: number;
  inProgress: number;
  workCompleted: number;
}

export interface FinancialKPI {
  totalLaborRevenue: string;
  totalPartsRevenue: string;
  totalGrossProfit: string;
  avgGrossMarginPct: string;
}

export interface LowStockItem {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  categoryName: string | null;
  stockLevel: number;
  reservedLevel: number;
  available: number;
  reorderPoint: number;
  locationName: string;
}

export interface RecentActivityEntry {
  id: string;
  productName: string;
  sku: string;
  changeQuantity: number;
  direction: string;
  referenceType: string;
  referenceNo: string | null;
  balanceAfter: number;
  locationName: string;
  actorName: string | null;
  createdAt: string;
}

export interface DashboardData {
  scope: DashboardScope;
  inventory: InventorySummary;
  procurement: ProcurementSummary | null;
  transfers: TransferSummary | null;
  jobCards: JobCardSummary | null;
  kpi: FinancialKPI | null;
  lowStockItems: LowStockItem[];
  recentActivity: RecentActivityEntry[];
}

/* ─── Hook ─── */

export function useDashboard(token: string, locationId: string) {
  return useQuery<DashboardData>({
    queryKey: ["dashboard", locationId],
    queryFn: () =>
      apiFetch<DashboardData>("/dashboard/summary", { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000, // 30s — dashboard refreshes on focus or location change
    refetchOnWindowFocus: true, // Override global default — dashboard should always show fresh data when user returns
  });
}
