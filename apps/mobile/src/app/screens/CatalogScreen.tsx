import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useCatalogSearch, type CatalogItem } from '@/hooks/use-catalog-search';
import ProductListItem from '@/components/ProductListItem';
import SyncStatusBar from '@/components/SyncStatusBar';
import { FavoritesGrid } from '@/components/FavoritesGrid';
import { useScanner } from '@/hardware/scanner/context';
import { useCartStore, selectLineCount } from '@/stores/cart-store';
import { runFullSync } from '@/sync/sync-manager';
import { addFavorite, isFavorite } from '@/storage/favorites';
import { Chip, Toast } from '@/components/ui';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, radius, layout } from '@/theme';
import type { POSStackParamList } from '@/app/MainTabs';

const CATEGORIES = ['TIRES', 'LUBRICANTS', 'HARD_PARTS', 'ACCESSORIES', 'LABOR_SERVICES'];

type Nav = StackNavigationProp<POSStackParamList, 'Catalog'>;

export default function CatalogScreen() {
  const navigation = useNavigation<Nav>();
  const { isTablet, screenPadding } = useLayout();
  const scanner = useScanner();
  const addLine = useCartStore(s => s.addLine);
  const lineCount = useCartStore(selectLineCount);
  const {
    query, setQuery, results, isSearching,
    category, setCategory, searchByBarcode, refresh,
  } = useCatalogSearch();

  const [refreshing, setRefreshing] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // ── Toast state ──
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastText(text);
    setToastVisible(true);
  }, []);

  const dismissToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  // Start scanner listening when on this screen
  useEffect(() => {
    scanner.startListening();
    const unsub = scanner.onScan(async (result) => {
      if (result.barcode === '__OPEN_CAMERA__') return;
      const product = await searchByBarcode(result.barcode);
      if (product) {
        addLine({
          serverId: product.serverId,
          name: product.name,
          sku: product.sku,
          mnemonicSku: product.mnemonicSku,
          barcode: product.barcode,
          unitPrice: product.unitPrice,
        });
        showToast(`Added: ${product.name}`);
      } else {
        Alert.alert('Not Found', `No product found for barcode ${result.barcode}`);
      }
    });
    return () => {
      scanner.stopListening();
      unsub();
    };
  }, [scanner, searchByBarcode, addLine, showToast]);

  // Build product map for FavoritesGrid from current results
  const productMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; retailPrice: number; available: number; reorderPoint: number }>();
    for (const item of results) {
      map.set(item.serverId, {
        id: item.serverId,
        name: item.name,
        retailPrice: item.unitPrice,
        available: item.stockLevel - item.reservedLevel,
        reorderPoint: item.reorderPoint,
      });
    }
    return map;
  }, [results]);

  const handleProductPress = useCallback((item: CatalogItem) => {
    addLine({
      serverId: item.serverId,
      name: item.name,
      sku: item.sku,
      mnemonicSku: item.mnemonicSku,
      barcode: item.barcode,
      unitPrice: item.unitPrice,
    });
    showToast(`Added: ${item.name}`);
  }, [addLine, showToast]);

  const handleProductLongPress = useCallback((item: CatalogItem) => {
    if (isFavorite(item.serverId)) {
      showToast('Already in favorites');
      return;
    }
    addFavorite(item.serverId);
    showToast(`★ ${item.name}`);
  }, [showToast]);

  const handleFavoriteAddToCart = useCallback((product: { id: string; name: string; retailPrice: number }) => {
    // Find the full CatalogItem from results for sku/barcode info
    const item = results.find(r => r.serverId === product.id);
    if (item) {
      addLine({
        serverId: item.serverId,
        name: item.name,
        sku: item.sku,
        mnemonicSku: item.mnemonicSku,
        barcode: item.barcode,
        unitPrice: item.unitPrice,
      });
    } else {
      // Fallback if item not in current results (e.g., filtered by category)
      addLine({
        serverId: product.id,
        name: product.name,
        sku: '',
        mnemonicSku: '',
        barcode: null,
        unitPrice: product.retailPrice,
      });
    }
    showToast(`Added: ${product.name}`);
  }, [results, addLine, showToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await runFullSync();
    refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleScanButton = useCallback(async () => {
    const result = await scanner.openCameraScanner();
    if (result) {
      const product = await searchByBarcode(result.barcode);
      if (product) {
        addLine({
          serverId: product.serverId,
          name: product.name,
          sku: product.sku,
          mnemonicSku: product.mnemonicSku,
          barcode: product.barcode,
          unitPrice: product.unitPrice,
        });
        showToast(`Added: ${product.name}`);
      } else {
        Alert.alert('Not Found', `No product for barcode ${result.barcode}`);
      }
    }
  }, [scanner, searchByBarcode, addLine, showToast]);

  const renderItem = useCallback(({ item, index }: { item: CatalogItem; index: number }) => (
    <ProductListItem item={item} index={index} onPress={handleProductPress} onLongPress={handleProductLongPress} />
  ), [handleProductPress, handleProductLongPress]);

  return (
    <View style={styles.container}>
      {/* Header — hide Cart button on tablet (cart panel is visible) */}
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        <Text style={styles.headerTitle}>APEX</Text>
        {!isTablet && (
          <Pressable
            style={styles.cartButton}
            onPress={() => navigation.navigate('Cart')}
            android_ripple={{ color: colors.accent.glow }}
          >
            <Text style={styles.cartIcon}>Cart</Text>
            {lineCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{lineCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* Sync status bar */}
      <SyncStatusBar />

      {/* Toast */}
      <Toast
        message={toastText}
        variant="success"
        visible={toastVisible}
        onDismiss={dismissToast}
      />

      {/* Search bar with integrated SCAN button */}
      <View style={[styles.searchBar, { paddingHorizontal: screenPadding }]}>
        <View
          style={[
            styles.searchInputContainer,
            searchFocused && styles.searchInputContainerFocused,
          ]}
        >
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, SKU, or barcode..."
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={colors.accent.primary}
            cursorColor={colors.accent.primary}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <Pressable
            style={styles.scanButton}
            onPress={handleScanButton}
            android_ripple={{ color: colors.accent.glow, borderless: true }}
          >
            <Text style={styles.scanButtonText}>SCAN</Text>
          </Pressable>
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipRow, { paddingHorizontal: screenPadding }]}
      >
        <Chip
          label="All"
          active={!category}
          onPress={() => setCategory(null)}
        />
        {CATEGORIES.map(cat => (
          <Chip
            key={cat}
            label={cat.replace('_', ' ')}
            active={category === cat}
            onPress={() => setCategory(category === cat ? null : cat)}
          />
        ))}
      </ScrollView>

      {/* Product list with alternating rows */}
      <FlatList
        data={results}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <FavoritesGrid productMap={productMap} onAddToCart={handleFavoriteAddToCart} />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.primary}
            colors={[colors.accent.primary]}
            progressBackgroundColor={colors.bg.surface}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {isSearching ? 'Searching...' :
               query ? 'No products found' : 'Pull to sync catalog'}
            </Text>
          </View>
        }
        initialNumToRender={30}
        maxToRenderPerBatch={20}
        windowSize={10}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.headerPaddingTop,
    paddingBottom: layout.headerPaddingBottom,
    backgroundColor: colors.bg.primary,
  },
  headerTitle: {
    ...textStyles.heading,
    color: colors.accent.primary,
  },
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cartIcon: {
    ...textStyles.caption,
    color: colors.text.primary,
  },
  cartBadge: {
    marginLeft: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    ...textStyles.captionSmall,
    color: colors.text.inverse,
    fontWeight: '700',
  },

  // ── Search bar ──
  searchBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  searchInputContainerFocused: {
    borderColor: colors.border.focus,
  },
  searchInput: {
    flex: 1,
    ...textStyles.body,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  scanButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  scanButtonText: {
    ...textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── Category chips ──
  chipRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },

  // ── Empty state ──
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.muted,
  },
});
