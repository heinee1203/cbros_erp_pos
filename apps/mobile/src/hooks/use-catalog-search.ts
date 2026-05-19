import { useState, useEffect, useCallback, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { database } from '@/db/database';
import { Product, Inventory } from '@/db/models';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@/hooks/use-auth';

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
  isSerialized: boolean;
  isTire: boolean;
  warrantyMonths: number | null;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  availableForSale: boolean;
}

const CATALOG_SEARCH_TIMEOUT_MS = 12000;
const BARCODE_LOOKUP_TIMEOUT_MS = 8000;
const CATALOG_RESULT_LIMIT = 100;

type InventorySnapshot = {
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  availableForSale: boolean;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

async function fetchCatalogProducts(
  searchQuery: string,
  filterCategory: string | null,
  locationId: string | null,
) {
  const productCollection = database.get<Product>('products');
  const values: any[] = [];
  const clauses = [
    `"products"."_status" is not 'deleted'`,
    `"products"."parent_product_id" is null`,
    `("products"."unit_price" > 0 or "products"."is_variable_price" is 1 or "products"."is_parent" is 1)`,
  ];

  const inventoryJoin = locationId
    ? `inner join "inventory" on "inventory"."product_server_id" = "products"."server_id" and "inventory"."location_id" = ? and "inventory"."_status" is not 'deleted'`
    : '';

  if (locationId) {
    values.push(locationId);
    clauses.push(`"inventory"."available_for_sale" is 1`);
    clauses.push(`("products"."is_parent" is 1 or "products"."is_variable_price" is 1 or ("inventory"."stock_level" - "inventory"."reserved_level") > 0)`);
  }

  const trimmedQuery = searchQuery.trim();
  if (trimmedQuery.length >= 2) {
    const words = trimmedQuery.split(/\s+/).filter(w => w.length > 0);
    const nameClauses = words.map(() => `"products"."name" like ?`);
    values.push(...words.map(word => `%${Q.sanitizeLikeString(word)}%`));

    const sanitizedFull = `%${Q.sanitizeLikeString(trimmedQuery)}%`;
    clauses.push(`((${nameClauses.join(' and ')}) or "products"."sku" like ? or "products"."mnemonic_sku" like ? or "products"."barcode" = ?)`);
    values.push(sanitizedFull, sanitizedFull, trimmedQuery);
  }

  if (filterCategory) {
    clauses.push(`"products"."family_name" = ?`);
    values.push(filterCategory);
  }

  const sql = `
    select distinct "products".*
    from "products"
    ${inventoryJoin}
    where ${clauses.join(' and ')}
    order by "products"."name" asc
    limit ${CATALOG_RESULT_LIMIT}
  `;

  return productCollection
    .query(Q.unsafeSqlQuery(sql, values))
    .fetch();
}

export function useCatalogSearch() {
  const { locationId } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const searchRequestRef = useRef(0);

  const search = useCallback(async (searchQuery: string, filterCategory: string | null) => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const startedAt = Date.now();
    let didFinish = false;
    const timeoutId = setTimeout(() => {
      if (requestId !== searchRequestRef.current || didFinish) return;

      console.error(`[CatalogSearch] Timed out after ${CATALOG_SEARCH_TIMEOUT_MS}ms`);
      setError('Catalog load timed out. Tap Retry or Sync Now.');
      setResults([]);
      setIsSearching(false);
    }, CATALOG_SEARCH_TIMEOUT_MS);

    setIsSearching(true);
    setError(null);

    try {
      const inventoryCollection = database.get<Inventory>('inventory');
      const products = await fetchCatalogProducts(searchQuery, filterCategory, locationId);

      // Hide variant children — only show parent products and standalone items
      // Batch inventory lookup — single query instead of N+1
      const productIds = products.map(p => p.serverId);
      const invMap = new Map<string, InventorySnapshot>();

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
          isSerialized: p.isSerialized ?? false,
          isTire: p.isTire ?? false,
          warrantyMonths: p.warrantyMonths ?? null,
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

      if (requestId !== searchRequestRef.current) return;

      didFinish = true;
      console.info(`[CatalogSearch] Loaded ${items.length} items in ${Date.now() - startedAt}ms`);
      setError(null);
      setResults(items);
    } catch (err) {
      console.error('[CatalogSearch] Error:', err);
      if (requestId === searchRequestRef.current) {
        didFinish = true;
        setError(getErrorMessage(err, 'Catalog could not be loaded. Tap Retry or Sync Now.'));
        setResults([]);
      }
    } finally {
      clearTimeout(timeoutId);
      if (requestId === searchRequestRef.current) {
        didFinish = true;
        setIsSearching(false);
      }
    }
  }, [locationId]);

  // Debounced search. The initial load is deferred until after first paint so
  // a slow local database can never leave the register on a blank screen.
  useEffect(() => {
    let interactionTask: { cancel?: () => void } | null = null;
    const timer = setTimeout(() => {
      interactionTask = InteractionManager.runAfterInteractions(() => {
        search(query, category);
      });
    }, query.length > 0 ? 200 : 300);

    return () => {
      clearTimeout(timer);
      interactionTask?.cancel?.();
    };
  }, [query, category, search]);

  const searchByBarcode = useCallback(async (barcode: string): Promise<CatalogItem | null> => {
    try {
      return await withTimeout((async () => {
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
          isSerialized: p.isSerialized ?? false,
          isTire: p.isTire ?? false,
          warrantyMonths: p.warrantyMonths ?? null,
          stockLevel,
          reservedLevel,
          reorderPoint,
          availableForSale,
        };
      })(), BARCODE_LOOKUP_TIMEOUT_MS, 'Barcode lookup timed out. Try again.');
    } catch (err) {
      console.error('[CatalogSearch] Barcode lookup error:', err);
      return null;
    }
  }, [locationId]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    error,
    category,
    setCategory,
    searchByBarcode,
    refresh: () => search(query, category),
  };
}
