/**
 * Inventory Screen — product catalog browser with stock status filter chips.
 *
 * Matches the Base44 reference: full-width product list, search bar,
 * horizontal filter chips (All / In Stock / Low Stock / Out of Stock),
 * each product row showing name, SKU, price, stock qty, and a colored
 * stock status dot.
 *
 * Reuses the same WatermelonDB query pattern from useCatalogSearch but
 * with stock-level filtering and a simplified layout (no cart interaction).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { database } from '@/db/database';
import { Product, Inventory } from '@/db/models';
import { Q } from '@nozbe/watermelondb';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { colors, fonts, fontSize } from '@/theme';

type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unitPrice: number;
  stockLevel: number;
  reorderPoint: number;
}

const FILTERS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In Stock' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
];

function getStockColor(stock: number, reorderPoint: number): string {
  if (stock <= 0) return '#EF4444';     // red
  if (stock <= reorderPoint) return '#F59E0B'; // amber
  return '#22C55E';                      // green
}

function fmtPrice(n: number): string {
  return `\u20B1${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InventoryScreen() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const locationId = storage.getString(KEYS.AUTH_LOCATION_ID);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const productCollection = database.get<Product>('products');
      const inventoryCollection = database.get<Inventory>('inventory');

      const conditions: any[] = [
        Q.where('parent_product_id', Q.eq(null)),
      ];

      if (query.length >= 2) {
        const words = query.trim().split(/\s+/).filter(w => w.length > 0);
        const sanitizedFull = Q.sanitizeLikeString(query.trim());
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
          ),
        );
      }

      const products = await productCollection
        .query(...conditions, Q.sortBy('name', Q.asc), Q.take(100))
        .fetch();

      // Batch inventory lookup
      const productIds = products.map(p => p.serverId);
      const invMap = new Map<string, { stockLevel: number; reorderPoint: number }>();

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
            reorderPoint: inv.reorderPoint,
          });
        }
      }

      let enriched: InventoryItem[] = products.map(p => {
        const inv = invMap.get(p.serverId);
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category || '',
          unitPrice: p.unitPrice,
          stockLevel: inv?.stockLevel ?? 0,
          reorderPoint: inv?.reorderPoint ?? 10,
        };
      });

      // Apply stock filter
      if (filter === 'in_stock') {
        enriched = enriched.filter(p => p.stockLevel > p.reorderPoint);
      } else if (filter === 'low_stock') {
        enriched = enriched.filter(p => p.stockLevel > 0 && p.stockLevel <= p.reorderPoint);
      } else if (filter === 'out_of_stock') {
        enriched = enriched.filter(p => p.stockLevel <= 0);
      }

      setItems(enriched);
    } catch (err) {
      console.error('[InventoryScreen] Error:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query, filter, locationId]);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(), query.length > 0 ? 250 : 0);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const dotColor = getStockColor(item.stockLevel, item.reorderPoint);
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <View style={[styles.stockDot, { backgroundColor: dotColor }]} />
          <View style={styles.rowInfo}>
            <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.productSku} numberOfLines={1}>{item.sku} · {item.category}</Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.price}>{fmtPrice(item.unitPrice)}</Text>
          <Text style={styles.stock}>{item.stockLevel} units</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <Pressable style={styles.stockCountBtn}>
          <Text style={styles.stockCountBtnText}>Stock Count</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>{'\u2315'}</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products by name or SKU..."
          placeholderTextColor={colors.text.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Product list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{'\uD83D\uDCCB'}</Text>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your search or filters</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  stockCountBtn: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stockCountBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderRadius: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchIcon: {
    fontSize: 18,
    color: colors.text.muted,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.border.medium,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    minHeight: 64,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  productSku: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  price: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  stock: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.text.muted,
  },
});
