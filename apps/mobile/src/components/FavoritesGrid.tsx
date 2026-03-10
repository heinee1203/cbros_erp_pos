import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { colors, textStyles, spacing, layout } from '@/theme';
import { getFavoriteIds, removeFavorite } from '@/storage/favorites';
import { FavoriteTile } from './FavoriteTile';
import { storage } from '@/storage/mmkv';

const COLLAPSED_KEY = 'favorites.collapsed';

interface Product {
  id: string;
  name: string;
  retailPrice: number;
  available: number;
  reorderPoint: number;
}

interface FavoritesGridProps {
  /** All products indexed by ID for fast lookup */
  productMap: Map<string, Product>;
  onAddToCart: (product: Product) => void;
}

export function FavoritesGrid({ productMap, onAddToCart }: FavoritesGridProps) {
  const favoriteIds = getFavoriteIds();
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

  if (favoriteIds.length === 0) return null;

  // Resolve products, filter out any that no longer exist
  const favorites = favoriteIds
    .map(id => productMap.get(id))
    .filter((p): p is Product => p != null)
    .slice(0, 6); // Max 6 tiles (3x2 grid)

  if (favorites.length === 0) return null;

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

  // Build rows of 3
  const rows: Product[][] = [];
  for (let i = 0; i < favorites.length; i += 3) {
    rows.push(favorites.slice(i, i + 3));
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={toggleCollapse}>
        <Text style={styles.headerText}>Quick Add</Text>
        <Text style={styles.chevron}>{collapsed ? '▸' : '▾'}</Text>
      </Pressable>

      {!collapsed && (
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map(product => (
                <FavoriteTile
                  key={product.id}
                  name={product.name}
                  price={product.retailPrice}
                  stockLevel={product.available}
                  reorderPoint={product.reorderPoint}
                  onPress={() => onAddToCart(product)}
                  onLongPress={() => handleLongPress(product)}
                />
              ))}
              {/* Fill empty slots to maintain grid alignment */}
              {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.emptySlot} />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: layout.screenPadding,
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
    letterSpacing: 0.5,
  },
  chevron: {
    ...textStyles.caption,
    color: colors.text.muted,
  },
  grid: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptySlot: {
    flex: 1,
  },
});
