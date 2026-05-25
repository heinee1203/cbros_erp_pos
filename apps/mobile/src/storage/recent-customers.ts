import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import type { Customer } from '@/hooks/use-customer-search';

export interface RecentCustomer {
  id: string;
  name: string;
  phone?: string | null;
  primaryPlateNo?: string | null;
  currentBalance?: string | null;
  creditLimit?: string | null;
  isOverdue?: boolean;
  selectedAt: string;
  tapCount: number;
}

const MAX_RECENT_CUSTOMERS = 10;

export function getRecentCustomers(): RecentCustomer[] {
  return (getJSON<RecentCustomer[]>(storage, KEYS.RECENT_CUSTOMERS) ?? [])
    .map(customer => ({
      ...customer,
      tapCount: customer.tapCount ?? 1,
    }))
    .sort((a, b) => {
      if (b.tapCount !== a.tapCount) return b.tapCount - a.tapCount;
      return new Date(b.selectedAt).getTime() - new Date(a.selectedAt).getTime();
    });
}

export function recordRecentCustomer(customer: Customer): void {
  const existing = getRecentCustomers().find(item => item.id === customer.id);
  const next: RecentCustomer = {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    primaryPlateNo: customer.primaryPlateNo,
    currentBalance: customer.currentBalance,
    creditLimit: customer.creditLimit,
    isOverdue: customer.isOverdue,
    selectedAt: new Date().toISOString(),
    tapCount: (existing?.tapCount ?? 0) + 1,
  };
  const deduped = getRecentCustomers().filter(item => item.id !== customer.id);
  setJSON(storage, KEYS.RECENT_CUSTOMERS, [next, ...deduped].slice(0, MAX_RECENT_CUSTOMERS));
}
