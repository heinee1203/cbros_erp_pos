import type { ReceiptRow } from "./receipt-utils";
import type { LocationMapping } from "./types";

export interface CachedReceiptsPreview {
  orgId: string;
  rows: ReceiptRow[];
  locationMapping: LocationMapping[];
  expiresAt: number;
}

const receiptsPreviewCache = new Map<string, CachedReceiptsPreview>();
const RECEIPTS_CACHE_TTL_MS = 30 * 60 * 1000;

export function storeReceiptsPreview(
  token: string,
  orgId: string,
  rows: ReceiptRow[],
  locationMapping: LocationMapping[],
): void {
  receiptsPreviewCache.set(token, {
    orgId,
    rows,
    locationMapping,
    expiresAt: Date.now() + RECEIPTS_CACHE_TTL_MS,
  });
}

export function getReceiptsPreview(token: string): CachedReceiptsPreview | null {
  const cached = receiptsPreviewCache.get(token);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    receiptsPreviewCache.delete(token);
    return null;
  }

  return cached;
}

export function deleteReceiptsPreview(token: string): void {
  receiptsPreviewCache.delete(token);
}

export function clearReceiptsPreviewCacheForTests(): void {
  receiptsPreviewCache.clear();
}
