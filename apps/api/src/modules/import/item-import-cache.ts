import type { CategoryMapping, LocationMapping, ParsedRow, ProgressUpdate } from "./types";

export interface CachedItemPreview {
  data: ParsedRow[];
  orgId: string;
  locationMapping: LocationMapping[];
  categoryMapping: CategoryMapping[];
  expiresAt: number;
}

export interface StoreItemPreviewOptions {
  token: string;
  data: ParsedRow[];
  orgId: string;
  locationMapping: LocationMapping[];
  categoryMapping: CategoryMapping[];
  now?: () => number;
  ttlMs?: number;
}

export const ITEM_IMPORT_CACHE_TTL_MS = 30 * 60 * 1000;

const itemPreviewCache = new Map<string, CachedItemPreview>();
const importProgressCache = new Map<string, ProgressUpdate>();

export function cleanExpiredItemPreviews(now = Date.now()): number {
  let deleted = 0;

  for (const [key, value] of itemPreviewCache) {
    if (value.expiresAt < now) {
      itemPreviewCache.delete(key);
      deleted++;
    }
  }

  return deleted;
}

export function storeItemPreview({
  token,
  data,
  orgId,
  locationMapping,
  categoryMapping,
  now = Date.now,
  ttlMs = ITEM_IMPORT_CACHE_TTL_MS,
}: StoreItemPreviewOptions): void {
  itemPreviewCache.set(token, {
    data,
    orgId,
    locationMapping,
    categoryMapping,
    expiresAt: now() + ttlMs,
  });
}

export function getItemPreview(token: string): CachedItemPreview | null {
  return itemPreviewCache.get(token) ?? null;
}

export function deleteItemPreview(token: string): void {
  itemPreviewCache.delete(token);
}

export function setImportProgress(token: string, progress: ProgressUpdate): void {
  importProgressCache.set(token, progress);
}

export function getImportProgress(token: string): ProgressUpdate | null {
  return importProgressCache.get(token) ?? null;
}

export function clearItemImportCachesForTests(): void {
  itemPreviewCache.clear();
  importProgressCache.clear();
}
