import { database } from '@/db/database';
import { Product } from '@/db/models';
import { apiFetch } from '@/services/api-client';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { Q } from '@nozbe/watermelondb';

interface ServerProduct {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  barcode: string | null;
  oemNumber: string | null;
  category: string;
  unitPrice: string;
  isVariablePrice: boolean;
  familyId: string | null;
  familyName: string | null;
  brandId: string | null;
  parentProductId: string | null;
  isParent: boolean;
  isSerialized: boolean;
  isTire: boolean;
  warrantyMonths: number | null;
  updatedAt: string;
}

interface CatalogSyncResponse {
  data: ServerProduct[];
  syncedAt: string;
  count: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export type SyncProgress = {
  phase: 'catalog' | 'inventory';
  synced: number;
  total: number | null;
};

// Keep below Android SQLite's common bind-parameter ceiling for oneOf queries.
const PAGE_SIZE = 500;

function mapProductFields(record: any, item: ServerProduct) {
  record.name = item.name;
  record.sku = item.sku;
  record.mnemonicSku = item.mnemonicSku;
  record.barcode = item.barcode;
  record.oemNumber = item.oemNumber;
  record.category = item.category;
  record.unitPrice = parseFloat(item.unitPrice);
  record.isVariablePrice = item.isVariablePrice;
  record.familyId = item.familyId;
  record.familyName = item.familyName;
  record.brandId = item.brandId;
  record.parentProductId = item.parentProductId;
  record.isParent = item.isParent;
  record.isSerialized = item.isSerialized ?? false;
  record.isTire = item.isTire ?? false;
  record.warrantyMonths = item.warrantyMonths ?? null;
  record.serverUpdatedAt = new Date(item.updatedAt).getTime();
}

export async function syncCatalog(
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ upserted: number }> {
  const since = storage.getString(KEYS.LAST_CATALOG_SYNC);
  const collection = database.get<Product>('products');

  let cursor: string | null = null;
  let totalSynced = 0;
  let lastSyncedAt: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Build paginated URL
    const params: string[] = [`limit=${PAGE_SIZE}`];
    if (since) params.push(`since=${encodeURIComponent(since)}`);
    if (cursor) params.push(`cursor=${cursor}`);
    const url = `/sync/catalog?${params.join('&')}`;

    const response = await apiFetch<CatalogSyncResponse>(url, {
      requireLockedLocation: true,
    });
    lastSyncedAt = response.syncedAt;

    if (response.data.length === 0) break;

    // Batch-query existing products by server_id (1 query, not N)
    const serverIds = response.data.map(item => item.id);
    const existingProducts = await collection
      .query(Q.where('server_id', Q.oneOf(serverIds)))
      .fetch();

    const existingMap = new Map<string, Product>();
    for (const p of existingProducts) {
      existingMap.set(p.serverId, p);
    }

    // Build batch operations
    const batchOps: any[] = [];
    for (const item of response.data) {
      const existing = existingMap.get(item.id);
      if (existing) {
        batchOps.push(
          existing.prepareUpdate((record: any) => mapProductFields(record, item)),
        );
      } else {
        batchOps.push(
          collection.prepareCreate((record: any) => {
            record.serverId = item.id;
            mapProductFields(record, item);
          }),
        );
      }
    }

    // Execute batch in a single write transaction
    await database.write(async () => {
      await database.batch(...batchOps);
    });

    totalSynced += response.data.length;

    // Report progress
    onProgress?.({
      phase: 'catalog',
      synced: totalSynced,
      total: null, // API doesn't return total count
    });

    // Check for more pages
    if (response.hasMore && response.nextCursor) {
      cursor = response.nextCursor;
    } else {
      break;
    }
  }

  // Save sync timestamp
  if (lastSyncedAt) {
    storage.set(KEYS.LAST_CATALOG_SYNC, lastSyncedAt);
  }

  return { upserted: totalSynced };
}
