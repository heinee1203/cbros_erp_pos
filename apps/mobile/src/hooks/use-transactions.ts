import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/services/api-client';
import { storage, getJSON, setJSON } from '@/storage/mmkv';
import { useState, useEffect } from 'react';

const RECENT_TX_KEY = 'transactions.recent';

/** Debounce a string value by `delay` ms */
export function useDebouncedValue(value: string, delay = 400): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface SaleListItem {
  id: string;
  saleNo: string;
  receiptNumber?: string | null;
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
    refundedQuantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  payments: Array<{
    method: string;
    amount: string;
    reference?: string | null;
    notes?: string | null;
  }>;
}

export function useSalesListQuery(searchQuery?: string) {
  const debouncedQ = useDebouncedValue(searchQuery?.trim() ?? '', 400);
  const isSearching = debouncedQ.length > 0;

  return useQuery<SaleListItem[]>({
    queryKey: ['sales', 'list', debouncedQ] as const,
    queryFn: async ({ queryKey }) => {
      const q = queryKey[2]; // Extract search term from query key (avoids stale closure)
      const searching = q.length > 0;

      // Build query string manually — RN's URLSearchParams.set is not implemented
      const parts: string[] = [
        'status=COMPLETED,PARTIALLY_REFUNDED,REFUNDED',
        'limit=50',
      ];
      if (!searching) {
        const today = new Date().toISOString().slice(0, 10);
        parts.push(`from=${today}`);
      }
      if (searching) {
        parts.push(`q=${encodeURIComponent(q)}`);
      }
      const result = await apiFetch<{ data: any[] }>(
        `/sales?${parts.join('&')}`,
      );
      const items: SaleListItem[] = result.data.map((s: any) => ({
        id: s.id,
        saleNo: s.saleNo || s.sale_no,
        receiptNumber: s.receiptNumber || s.receipt_number || null,
        status: s.status,
        grandTotal: s.grandTotal || s.grand_total,
        completedAt: s.completedAt || s.completed_at,
        createdAt: s.createdAt || s.created_at,
        customerName: s.customerName || s.customer_name || null,
        lineCount: s.lineCount || s.line_count || 0,
      }));

      // Cache locally for quick access (only for default/non-search view)
      if (!searching) {
        setJSON(storage, RECENT_TX_KEY, items.slice(0, 20));
      }
      return items;
    },
    staleTime: isSearching ? 0 : 15_000,
    refetchOnMount: 'always',
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
