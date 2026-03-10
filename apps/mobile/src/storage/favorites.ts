import { storage, getJSON, setJSON } from './mmkv';

const KEY = 'favorites.productIds';

export function getFavoriteIds(): string[] {
  return getJSON<string[]>(storage, KEY) ?? [];
}

export function addFavorite(productId: string): void {
  const ids = getFavoriteIds();
  if (!ids.includes(productId)) {
    ids.push(productId);
    setJSON(storage, KEY, ids);
  }
}

export function removeFavorite(productId: string): void {
  const ids = getFavoriteIds().filter(id => id !== productId);
  setJSON(storage, KEY, ids);
}

export function isFavorite(productId: string): boolean {
  return getFavoriteIds().includes(productId);
}
