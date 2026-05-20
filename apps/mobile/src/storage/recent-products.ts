import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export interface RecentProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  retailPrice: number;
  available: number;
  reorderPoint: number;
  addedAt: string;
  tapCount: number;
}

const MAX_RECENT_PRODUCTS = 12;

export function getRecentProducts(): RecentProduct[] {
  return (getJSON<RecentProduct[]>(storage, KEYS.RECENT_PRODUCTS) ?? [])
    .map(item => ({
      ...item,
      tapCount: item.tapCount ?? 1,
    }))
    .sort((a, b) => {
      if (b.tapCount !== a.tapCount) return b.tapCount - a.tapCount;
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });
}

export function recordRecentProduct(product: Omit<RecentProduct, 'addedAt' | 'tapCount'>): void {
  const existing = getRecentProducts().find(item => item.id === product.id);
  const next: RecentProduct = {
    ...product,
    addedAt: new Date().toISOString(),
    tapCount: (existing?.tapCount ?? 0) + 1,
  };
  const deduped = getRecentProducts().filter(item => item.id !== product.id);
  setJSON(storage, KEYS.RECENT_PRODUCTS, [next, ...deduped].slice(0, MAX_RECENT_PRODUCTS));
}

export function clearRecentProducts(): void {
  storage.delete(KEYS.RECENT_PRODUCTS);
}
