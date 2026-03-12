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
  category: string;
  unitPrice: string;
  familyId: string | null;
  updatedAt: string;
}

interface CatalogSyncResponse {
  data: ServerProduct[];
  syncedAt: string;
  count: number;
}

export async function syncCatalog(): Promise<{ upserted: number }> {
  const since = storage.getString(KEYS.LAST_CATALOG_SYNC);
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';

  const response = await apiFetch<CatalogSyncResponse>(`/sync/catalog${qs}`);

  if (response.data.length === 0) {
    storage.set(KEYS.LAST_CATALOG_SYNC, response.syncedAt);
    return { upserted: 0 };
  }

  const collection = database.get<Product>('products');

  await database.write(async () => {
    const batchOps: any[] = [];

    for (const item of response.data) {
      // Check if product already exists locally
      const existing = await collection
        .query(Q.where('server_id', item.id))
        .fetch();

      if (existing.length > 0) {
        // Update
        batchOps.push(
          existing[0].prepareUpdate((record: any) => {
            record.name = item.name;
            record.sku = item.sku;
            record.mnemonicSku = item.mnemonicSku;
            record.barcode = item.barcode;
            record.category = item.category;
            record.unitPrice = parseFloat(item.unitPrice);
            record.familyId = item.familyId;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      } else {
        // Insert
        batchOps.push(
          collection.prepareCreate((record: any) => {
            record.serverId = item.id;
            record.name = item.name;
            record.sku = item.sku;
            record.mnemonicSku = item.mnemonicSku;
            record.barcode = item.barcode;
            record.category = item.category;
            record.unitPrice = parseFloat(item.unitPrice);
            record.familyId = item.familyId;
            record.serverUpdatedAt = new Date(item.updatedAt).getTime();
          }),
        );
      }
    }

    await database.batch(...batchOps);
  });

  storage.set(KEYS.LAST_CATALOG_SYNC, response.syncedAt);
  return { upserted: response.data.length };
}
