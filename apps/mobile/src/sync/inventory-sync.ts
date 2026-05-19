import { database } from '@/db/database';
import { Inventory } from '@/db/models';
import { apiFetch } from '@/services/api-client';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { Q } from '@nozbe/watermelondb';
import type { SyncProgress } from './catalog-sync';

interface ServerInventory {
  id: string;
  productId: string;
  locationId: string;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  availableForSale: boolean;
  updatedAt: string;
}

interface InventorySyncResponse {
  data: ServerInventory[];
  syncedAt: string;
  count: number;
  nextCursor: string | null;
  hasMore: boolean;
}

// Keep below Android SQLite's common bind-parameter ceiling for oneOf queries.
const PAGE_SIZE = 500;

function mapInventoryFields(record: any, item: ServerInventory) {
  record.productServerId = item.productId;
  record.locationId = item.locationId;
  record.stockLevel = item.stockLevel;
  record.reservedLevel = item.reservedLevel;
  record.reorderPoint = item.reorderPoint;
  record.availableForSale = item.availableForSale;
  record.serverUpdatedAt = new Date(item.updatedAt).getTime();
}

export async function syncInventory(
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ upserted: number }> {
  const since = storage.getString(KEYS.LAST_INVENTORY_SYNC);
  const collection = database.get<Inventory>('inventory');

  let cursor: string | null = null;
  let totalSynced = 0;
  let lastSyncedAt: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params: string[] = [`limit=${PAGE_SIZE}`];
    if (since) params.push(`since=${encodeURIComponent(since)}`);
    if (cursor) params.push(`cursor=${cursor}`);
    const url = `/sync/inventory?${params.join('&')}`;

    const response = await apiFetch<InventorySyncResponse>(url, {
      requireLockedLocation: true,
    });
    lastSyncedAt = response.syncedAt;

    if (response.data.length === 0) break;

    // Batch-query existing inventory records (1 query, not N)
    const serverIds = response.data.map(item => item.id);
    const existingRows = await collection
      .query(Q.where('server_id', Q.oneOf(serverIds)))
      .fetch();

    const existingMap = new Map<string, Inventory>();
    for (const inv of existingRows) {
      existingMap.set(inv.serverId, inv);
    }

    // Build batch operations
    const batchOps: any[] = [];
    for (const item of response.data) {
      const existing = existingMap.get(item.id);
      if (existing) {
        batchOps.push(
          existing.prepareUpdate((record: any) => mapInventoryFields(record, item)),
        );
      } else {
        batchOps.push(
          collection.prepareCreate((record: any) => {
            record.serverId = item.id;
            mapInventoryFields(record, item);
          }),
        );
      }
    }

    await database.write(async () => {
      await database.batch(...batchOps);
    });

    totalSynced += response.data.length;

    onProgress?.({
      phase: 'inventory',
      synced: totalSynced,
      total: null,
    });

    if (response.hasMore && response.nextCursor) {
      cursor = response.nextCursor;
    } else {
      break;
    }
  }

  if (lastSyncedAt) {
    storage.set(KEYS.LAST_INVENTORY_SYNC, lastSyncedAt);
  }

  return { upserted: totalSynced };
}
