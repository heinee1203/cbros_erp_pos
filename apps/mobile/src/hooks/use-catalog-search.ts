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
  familyName: string | null;
  unitPrice: number;
  isVariablePrice: boolean;
  isParent: boolean;
  parentProductId: string | null;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  availableForSale: boolean;
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
      // Hide variant children — only show parent products and standalone items
      const conditions: any[] = [
        Q.where('parent_product_id', Q.eq(null)),
      ];

      if (searchQuery.length >= 2) {
        const words = searchQuery.trim().split(/\s+/).filter(w => w.length > 0);
        const sanitizedFull = Q.sanitizeLikeString(searchQuery.trim());

        // Multi-word: each word must appear somewhere in the name (AND logic)
        const nameConditions = words.map(word =>
          Q.where('name', Q.like(`%${Q.sanitizeLikeString(word)}%`)),
        );
        const nameQuery = nameConditions.length === 1
          ? nameConditions[0]
          : Q.and(...nameConditions);

        conditions.push(
          Q.or(
            nameQuery,
            Q.where('sku', Q.like(`%${sanitizedFull}%`)),
            Q.where('mnemonic_sku', Q.like(`%${sanitizedFull}%`)),
            Q.where('barcode', searchQuery.trim()), // Exact match for barcode
          ),
        );
      }

      if (filterCategory) {
        conditions.push(Q.where('family_name', filterCategory));
      }

      const products = await productCollection
        .query(...conditions, Q.sortBy('name', Q.asc), Q.take(100))
        .fetch();

      // Batch inventory lookup — single query instead of N+1
      const productIds = products.map(p => p.serverId);
      let invMap = new Map<string, { stockLevel: number; reservedLevel: number; reorderPoint: number; availableForSale: boolean }>();

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
            availableForSale: inv.availableForSale,
          });
        }
      }

      const enriched: CatalogItem[] = products.map(p => {
        const inv = invMap.get(p.serverId);
        return {
          id: p.id,
          serverId: p.serverId,
          name: p.name,
          sku: p.sku,
          mnemonicSku: p.mnemonicSku,
          barcode: p.barcode,
          category: p.category,
          familyName: p.familyName,
          unitPrice: p.unitPrice,
          isVariablePrice: p.isVariablePrice,
          isParent: p.isParent,
          parentProductId: p.parentProductId,
          stockLevel: inv?.stockLevel ?? 0,
          reservedLevel: inv?.reservedLevel ?? 0,
          reorderPoint: inv?.reorderPoint ?? 10,
          availableForSale: inv?.availableForSale ?? false,
        };
      });

      // Filter: available for sale + hide unsellable zero-price items (Fix 3)
      const items = enriched.filter(p =>
        p.availableForSale &&
        // Hide items with ₱0 price UNLESS they are variable-price or parent items
        (p.unitPrice > 0 || p.isVariablePrice || p.isParent)
      );

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
    let availableForSale = false;

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
        availableForSale = inv[0].availableForSale;
      }
    }

    // Barcode scan returns the product even if not available for sale
    // (caller should show a warning alert if availableForSale is false)
    return {
      id: p.id,
      serverId: p.serverId,
      name: p.name,
      sku: p.sku,
      mnemonicSku: p.mnemonicSku,
      barcode: p.barcode,
      category: p.category,
      familyName: p.familyName,
      unitPrice: p.unitPrice,
      isVariablePrice: p.isVariablePrice,
      isParent: p.isParent,
      parentProductId: p.parentProductId,
      stockLevel,
      reservedLevel,
      reorderPoint,
      availableForSale,
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
