import { useState, useEffect, useCallback } from 'react';
import { database } from '@/db/database';
import { Product, Inventory } from '@/db/models';
import { Q } from '@nozbe/watermelondb';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export interface CatalogItem {
  id: string;          // WatermelonDB local id
  serverId: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  barcode: string | null;
  category: string;
  unitPrice: number;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
}

export function useCatalogSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  const locationId = storage.getString(KEYS.AUTH_LOCATION_ID);

  const search = useCallback(async (searchQuery: string, filterCategory: string | null) => {
    setIsSearching(true);

    try {
      const productCollection = database.get<Product>('products');
      const inventoryCollection = database.get<Inventory>('inventory');

      // Build product query conditions
      const conditions: any[] = [];

      if (searchQuery.length >= 2) {
        const q = Q.sanitizeLikeString(searchQuery);
        conditions.push(
          Q.or(
            Q.where('name', Q.like(`%${q}%`)),
            Q.where('sku', Q.like(`%${q}%`)),
            Q.where('mnemonic_sku', Q.like(`%${q}%`)),
            Q.where('barcode', searchQuery), // Exact match for barcode
          ),
        );
      }

      if (filterCategory) {
        conditions.push(Q.where('category', filterCategory));
      }

      const products = await productCollection
        .query(...conditions, Q.take(100))
        .fetch();

      // Batch inventory lookup — single query instead of N+1
      const productIds = products.map(p => p.serverId);
      let invMap = new Map<string, { stockLevel: number; reservedLevel: number; reorderPoint: number }>();

      if (locationId && productIds.length > 0) {
        const allInventory = await inventoryCollection
          .query(
            Q.where('product_server_id', Q.oneOf(productIds)),
            Q.where('location_id', locationId),
          )
          .fetch();

        for (const inv of allInventory) {
          invMap.set(inv.productServerId, {
            stockLevel: inv.stockLevel,
            reservedLevel: inv.reservedLevel,
            reorderPoint: inv.reorderPoint,
          });
        }
      }

      const items: CatalogItem[] = products.map(p => {
        const inv = invMap.get(p.serverId);
        return {
          id: p.id,
          serverId: p.serverId,
          name: p.name,
          sku: p.sku,
          mnemonicSku: p.mnemonicSku,
          barcode: p.barcode,
          category: p.category,
          unitPrice: p.unitPrice,
          stockLevel: inv?.stockLevel ?? 0,
          reservedLevel: inv?.reservedLevel ?? 0,
          reorderPoint: inv?.reorderPoint ?? 10,
        };
      });

      setResults(items);
    } catch (err) {
      console.error('[CatalogSearch] Error:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [locationId]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(query, category);
    }, query.length > 0 ? 200 : 0); // Instant for empty query (show all), debounce for typed

    return () => clearTimeout(timer);
  }, [query, category, search]);

  const searchByBarcode = useCallback(async (barcode: string): Promise<CatalogItem | null> => {
    const productCollection = database.get<Product>('products');
    const products = await productCollection
      .query(Q.where('barcode', barcode))
      .fetch();

    if (products.length === 0) return null;

    const p = products[0];
    const inventoryCollection = database.get<Inventory>('inventory');
    let stockLevel = 0;
    let reservedLevel = 0;
    let reorderPoint = 10;

    if (locationId) {
      const inv = await inventoryCollection
        .query(
          Q.where('product_server_id', p.serverId),
          Q.where('location_id', locationId),
        )
        .fetch();
      if (inv.length > 0) {
        stockLevel = inv[0].stockLevel;
        reservedLevel = inv[0].reservedLevel;
        reorderPoint = inv[0].reorderPoint;
      }
    }

    return {
      id: p.id,
      serverId: p.serverId,
      name: p.name,
      sku: p.sku,
      mnemonicSku: p.mnemonicSku,
      barcode: p.barcode,
      category: p.category,
      unitPrice: p.unitPrice,
      stockLevel,
      reservedLevel,
      reorderPoint,
    };
  }, [locationId]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    category,
    setCategory,
    searchByBarcode,
    refresh: () => search(query, category),
  };
}
