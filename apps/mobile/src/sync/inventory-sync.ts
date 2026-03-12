import { database } from '@/db/database';
import { Inventory } from '@/db/models';
import { apiFetch } from '@/services/api-client';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { Q } from '@nozbe/watermelondb';

interface ServerInventory {
  id: string;
  productId: string;
  locationId: string;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  updatedAt: string;
}

interface InventorySyncResponse {
  data: ServerInventory[];
  syncedAt: string;
  count: number;
}

export async function syncInventory(): Promise<{ upserted: number }> {
  const since = storage.getString(KEYS.LAST_INVENTORY_SYNC);
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';

  const response = await apiFetch<InventorySyncResponse>(`/sync/inventory${qs}`);

  if (response.data.length === 0) {
    storage.set(KEYS.LAST_INVENTORY_SYNC, response.syncedAt);
    return { upserted: 0 };
  }

  const collection = database.get<Inventory>('inventory');

  await database.write(async () => {
    const batchOps: any[] = [];

    for (const item of response.data) {
      const existing = await collection
        .query(Q.where('server_id', item.id))
        .fetch();

      if (existing.length > 0) {
        batchOps.push(
          existing[0].prepareUpdate((record: any) => {
            record.productServerId = item.productId;
            record.locationId = item.locationId;
            record.stockLevel = item.stockLevel;
            record.reservedLevel = item.reservedLevel;
            record.reorderPoint = item.reorderPoint;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      } else {
        batchOps.push(
          collection.prepareCreate((record: any) => {
            record.serverId = item.id;
            record.productServerId = item.productId;
            record.locationId = item.locationId;
            record.stockLevel = item.stockLevel;
            record.reservedLevel = item.reservedLevel;
            record.reorderPoint = item.reorderPoint;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      }
    }

    await database.batch(...batchOps);
  });

  storage.set(KEYS.LAST_INVENTORY_SYNC, response.syncedAt);
  return { upserted: response.data.length };
}
