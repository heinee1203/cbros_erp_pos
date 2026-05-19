import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/services/api-client';

export interface ActiveShift {
  id: string;
  status: string;
  openedAt: string;
  openingFloat: string;
  userId: string;
  locationId: string;
  cashierName: string;
  locationName: string;
}

export function useActiveShiftQuery() {
  return useQuery<ActiveShift | null>({
    queryKey: ['shifts', 'active'],
    queryFn: async () => {
      const result = await apiFetch<{ data: ActiveShift | null }>('/shifts/active');
      return result.data;
    },
    refetchOnMount: 'always',
    staleTime: 10_000,
  });
}

export interface ShiftListItem {
  id: string;
  status: 'OPEN' | 'CLOSED' | 'FORCE_CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  actualCash: string | null;
  cashVariance: string | null;
  notes: string | null;
  cashierName: string;
  locationName: string;
  grossSales: string;
  refundsTotal?: string;
  netSales?: string;
  transactionCount?: number;
  voidCount?: number;
  drawerEventCount?: number;
  drawerPaidInTotal?: string;
  drawerPaidOutTotal?: string;
  drawerNetCash?: string;
}

export interface ShiftListResult {
  data: ShiftListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ShiftDetail extends ShiftListItem {
  timezone?: string | null;
  zReadingSnapshot?: ZReadingData | null;
}

export interface ShiftListQueryParams {
  status?: ShiftListItem['status'] | Array<ShiftListItem['status']>;
  from?: string;
  to?: string;
  userId?: string;
  locationId?: string;
  allLocations?: boolean;
  limit?: number;
}

function buildShiftListPath(params: ShiftListQueryParams): string {
  const pairs: Array<[string, string]> = [['limit', String(params.limit ?? 50)]];

  if (params.status) {
    pairs.push(['status', Array.isArray(params.status) ? params.status.join(',') : params.status]);
  }
  if (params.from) pairs.push(['from', params.from]);
  if (params.to) pairs.push(['to', params.to]);
  if (params.userId) pairs.push(['userId', params.userId]);
  if (params.locationId) pairs.push(['locationId', params.locationId]);
  if (params.allLocations) pairs.push(['allLocations', 'true']);

  const query = pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return `/shifts?${query}`;
}

export function useShiftListQuery(enabled = true, params: ShiftListQueryParams = {}) {
  return useQuery<ShiftListResult>({
    queryKey: ['shifts', 'list', params],
    queryFn: async () => {
      return apiFetch<ShiftListResult>(buildShiftListPath(params));
    },
    enabled,
    refetchOnMount: 'always',
  });
}

export function useShiftDetailQuery(shiftId: string) {
  return useQuery<ShiftDetail>({
    queryKey: ['shifts', 'detail', shiftId],
    queryFn: async () => {
      const result = await apiFetch<{ data: ShiftDetail }>(`/shifts/${shiftId}`);
      return result.data;
    },
    enabled: !!shiftId,
  });
}

export interface ZReadingData {
  shiftId: string;
  cashierName: string;
  locationName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  salesSummary: {
    grossSales: string;
    refundsTotal: string;
    netSales: string;
    transactionCount: number;
    avgTicket: string;
    voidCount: number;
  };
  paymentBreakdown: Array<{
    method: string;
    total: string;
    count: number;
  }>;
  cashReconciliation: {
    expectedCash: string;
    actualCash: string | null;
    variance: string | null;
  };
  topItems: Array<{
    productName: string;
    mnemonicSku: string;
    unitsSold: number;
    totalRevenue: string;
  }>;
  accountability: {
    voids: Array<{
      saleNo: string;
      amount: string;
      voidedAt: string | null;
      voidedBy: string | null;
      reason: string | null;
    }>;
    refunds: Array<{
      saleNo: string;
      amount: string;
      refundedAt: string | null;
      refundedBy: string | null;
      reason: string | null;
    }>;
    drawerEvents?: Array<{
      id: string;
      type: 'NO_SALE' | 'PAID_IN' | 'PAID_OUT';
      amount: string;
      reason: string;
      locationId: string;
      locationName: string;
      shiftId: string;
      cashierId: string;
      cashierName: string;
      approvedBy: string;
      authorizationMethod: 'pin' | 'barcode' | 'card';
      authorizationUserId: string | null;
      drawerOpened: boolean;
      drawerError: string | null;
      clientEventId: string | null;
      createdAt: string;
    }>;
  };
}

export function useZReadingQuery(shiftId: string) {
  return useQuery<ZReadingData>({
    queryKey: ['shifts', 'z-reading', shiftId],
    queryFn: async () => {
      const result = await apiFetch<{ data: ZReadingData }>(
        `/shifts/${shiftId}/z-reading`,
      );
      return result.data;
    },
    enabled: !!shiftId,
    refetchOnMount: 'always',
  });
}
