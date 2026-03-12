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
    }>;
    refunds: Array<{
      saleNo: string;
      amount: string;
      refundedAt: string | null;
      refundedBy: string | null;
      reason: string | null;
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
