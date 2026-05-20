import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { colors, textStyles, spacing } from '@/theme';
import { useLayout } from '@/hooks/use-layout';
import { getFavoriteIds, removeFavorite } from '@/storage/favorites';
import { getRecentProducts } from '@/storage/recent-products';
import { FavoriteTile } from './FavoriteTile';
import { storage } from '@/storage/mmkv';

const COLLAPSED_KEY = 'favorites.collapsed';

interface Product {
  id: string;
  name: string;
  retailPrice: number;
  available: number;
  reorderPoint: number;
  sku?: string | null;
  barcode?: string | null;
}

interface FavoritesGridProps {
  /** All products indexed by ID for fast lookup */
  productMap: Map<string, Product>;
  onAddToCart: (product: Product) => void;
}

export function FavoritesGrid({ productMap, onAddToCart }: FavoritesGridProps) {
  const styles = createStyles();
  const { favoriteColumns, favoriteMax, screenPadding } = useLayout();
  const favoriteIds = getFavoriteIds();
  const recentProducts = getRecentProducts();
  const [collapsed, setCollapsed] = useState(
    () => storage.getBoolean(COLLAPSED_KEY) ?? false,
  );
  // Force re-render after remove
  const [, setTick] = useState(0);

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      storage.set(COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  // Resolve products, filter out any that no longer exist
  const favorites = favoriteIds
    .map(id => productMap.get(id))
    .filter((p): p is Product => p != null)
    .slice(0, favoriteMax);
  const favoriteIdSet = new Set(favorites.map(product => product.id));
  const recents = recentProducts
    .map(recent => productMap.get(recent.id) ?? recent)
    .filter((product): product is Product => !!product && !favoriteIdSet.has(product.id))
    .slice(0, favoriteMax);

  if (favorites.length === 0 && recents.length === 0) return null;

  const handleFavoriteTap = (product: Product) => {
    // Validate required fields before adding to cart
    if (!product.name || product.retailPrice == null || product.retailPrice <= 0) {
      Alert.alert(
        'Invalid Product',
        `"${product.name || 'Unknown'}" has incomplete data. Check the web dashboard.`,
      );
      return;
    }
    onAddToCart(product);
  };

  const handleLongPress = (product: Product) => {
    Alert.alert(
      'Remove Favorite',
      `Remove "${product.name}" from favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeFavorite(product.id);
            setTick(t => t + 1);
          },
        },
      ],
    );
  };

  const buildRows = (products: Product[]) => {
    const rows: Product[][] = [];
    for (let i = 0; i < products.length; i += favoriteColumns) {
      rows.push(products.slice(i, i + favoriteColumns));
    }
    return rows;
  };

  return (
    <View style={[styles.container, { paddingHorizontal: screenPadding }]}>
      <Pressable style={styles.header} onPress={toggleCollapse}>
        <Text style={styles.headerText}>Quick Add</Text>
        <Text style={styles.chevron}>{collapsed ? '\u25B8' : '\u25BE'}</Text>
      </Pressable>

      {!collapsed && (
        <View style={styles.grid}>
          {favorites.length > 0 && (
            <ProductTileSection
              label="Favorites"
              rows={buildRows(favorites)}
              favoriteColumns={favoriteColumns}
              onTap={handleFavoriteTap}
              onLongPress={handleLongPress}
            />
          )}
          {recents.length > 0 && (
            <ProductTileSection
              label="Recent"
              rows={buildRows(recents)}
              favoriteColumns={favoriteColumns}
              onTap={handleFavoriteTap}
            />
          )}
        </View>
      )}
    </View>
  );
}

function ProductTileSection({
  label,
  rows,
  favoriteColumns,
  onTap,
  onLongPress,
}: {
  label: string;
  rows: Product[][];
  favoriteColumns: number;
  onTap: (product: Product) => void;
  onLongPress?: (product: Product) => void;
}) {
  const styles = createStyles();
  return (
    <View style={styles.tileSection}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {rows.map((row, ri) => (
        <View key={`${label}-${ri}`} style={styles.row}>
          {row.map(product => (
            <FavoriteTile
              key={product.id}
              name={product.name}
              price={product.retailPrice}
              stockLevel={product.available}
              reorderPoint={product.reorderPoint}
              onPress={() => onTap(product)}
              onLongPress={onLongPress ? () => onLongPress(product) : undefined}
            />
          ))}
          {row.length < favoriteColumns && Array.from({ length: favoriteColumns - row.length }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.emptySlot} />
          ))}
        </View>
      ))}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  headerText: {
    ...textStyles.caption,
    color: colors.accent.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  chevron: {
    ...textStyles.caption,
    color: colors.text.muted,
  },
  grid: {
    gap: spacing.sm,
  },
  tileSection: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptySlot: {
    flex: 1,
  },
});
