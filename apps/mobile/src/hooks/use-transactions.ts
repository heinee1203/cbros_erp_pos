import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/services/api-client';
import { storage, getJSON, setJSON } from '@/storage/mmkv';

const RECENT_TX_KEY = 'transactions.recent';

export interface SaleListItem {
  id: string;
  saleNo: string;
  status: string;
  grandTotal: string;
  completedAt: string | null;
  createdAt: string;
  customerName?: string | null;
  lineCount: number;
}

export interface SaleDetail {
  id: string;
  saleNo: string;
  status: string;
  subtotal: string;
  discountTotal: string;
  grandTotal: string;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  location: { name: string; address?: string | null };
  customer?: { name: string; phone: string } | null;
  vehicle?: { make: string; model: string; plateNo?: string | null } | null;
  lines: Array<{
    id: string;
    productName: string;
    mnemonicSku: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  payments: Array<{
    method: string;
    amount: string;
  }>;
}

export function useSalesListQuery() {
  return useQuery<SaleListItem[]>({
    queryKey: ['sales', 'list'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = await apiFetch<{ data: any[] }>(
        `/sales?status=COMPLETED,REFUNDED&from=${today}&limit=50`,
      );

      const items: SaleListItem[] = result.data.map((s: any) => ({
        id: s.id,
        saleNo: s.saleNo || s.sale_no,
        status: s.status,
        grandTotal: s.grandTotal || s.grand_total,
        completedAt: s.completedAt || s.completed_at,
        createdAt: s.createdAt || s.created_at,
        customerName: s.customerName || s.customer_name || null,
        lineCount: s.lineCount || s.line_count || 0,
      }));

      // Cache locally for quick access
      setJSON(storage, RECENT_TX_KEY, items.slice(0, 20));
      return items;
    },
    staleTime: 15_000,
  });
}

export function useSaleDetailQuery(saleId: string) {
  return useQuery<SaleDetail>({
    queryKey: ['sales', 'detail', saleId],
    queryFn: async () => {
      return apiFetch<SaleDetail>(`/sales/${saleId}`);
    },
    enabled: !!saleId,
  });
}

export function getCachedTransactions(): SaleListItem[] {
  return getJSON<SaleListItem[]>(storage, RECENT_TX_KEY) ?? [];
}
