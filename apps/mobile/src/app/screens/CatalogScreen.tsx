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
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useCatalogSearch, type CatalogItem } from '@/hooks/use-catalog-search';
import ProductListItem from '@/components/ProductListItem';
import { FavoritesGrid } from '@/components/FavoritesGrid';
import { useScanner } from '@/hardware/scanner/context';
import { useCartStore, selectLineCount } from '@/stores/cart-store';
import { database } from '@/db/database';
import { Product } from '@/db/models';
import { Q } from '@nozbe/watermelondb';
import { runFullSync } from '@/sync/sync-manager';
import { Inventory } from '@/db/models';
import { Button, Chip, Toast, Icon } from '@/components/ui';
import { useLayout } from '@/hooks/use-layout';
import { useAuth } from '@/hooks/use-auth';
import { colors, textStyles, spacing, radius, layout } from '@/theme';
import { ProductDetailSheet } from '@/components/ProductDetailSheet';
import { BarcodeScanModal } from '@/components/BarcodeScanModal';
import { useTheme } from '@/theme/ThemeContext';
import { recordRecentProduct } from '@/storage/recent-products';
import type { POSStackParamList } from '@/app/MainTabs';

type Nav = StackNavigationProp<POSStackParamList, 'Catalog'>;

function getAvailableQty(item: CatalogItem): number {
  return Math.max(0, item.stockLevel - item.reservedLevel);
}

export default function CatalogScreen() {
  const navigation = useNavigation<Nav>();
  useTheme(); // Subscribe to theme changes for re-render
  const { isTablet, screenPadding } = useLayout();
  const { locationId } = useAuth();
  const scanner = useScanner();
  const addLine = useCartStore(s => s.addLine);
  const cartLines = useCartStore(s => s.lines);
  const lineCount = useCartStore(selectLineCount);
  const {
    query, setQuery, results, isSearching, error,
    category, setCategory, searchByBarcode, refresh,
  } = useCatalogSearch();

  const [refreshing, setRefreshing] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [scanModalVisible, setScanModalVisible] = useState(false);

  // ── Product family tabs (loaded from DB) ──
  const families = useMemo(() => (
    Array.from(new Set(results.map(item => item.familyName).filter((family): family is string => !!family))).sort()
  ), [results]);

  // ── Variable price modal state ──
  const [variablePriceItem, setVariablePriceItem] = useState<CatalogItem | null>(null);
  const [enteredPrice, setEnteredPrice] = useState('');

  // ── Variant picker modal state ──
  const [variantParent, setVariantParent] = useState<CatalogItem | null>(null);
  const [variantChildren, setVariantChildren] = useState<CatalogItem[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  // ── Toast state ──
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastText(text);
    setToastVisible(true);
  }, []);

  const dismissToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  // Dynamic styles (reads mutated colors for light/dark theme)
  const styles = createStyles();

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

  const canAddItemToCart = useCallback((item: CatalogItem, overridePrice?: number) => {
    if (item.isParent) {
      showToast('Select a variant first');
      return false;
    }
    if (!item.availableForSale) {
      Alert.alert('Not Available', `${item.name} is not available for sale at this branch.`);
      return false;
    }

    const finalPrice = overridePrice ?? item.unitPrice;
    if (!item.isVariablePrice && (!finalPrice || finalPrice <= 0)) {
      showToast('Price not set - cannot add to cart');
      return false;
    }

    if (!item.isVariablePrice) {
      const available = getAvailableQty(item);
      const inCart = cartLines
        .filter(line => line.productId === item.serverId)
        .reduce((sum, line) => sum + line.quantity, 0);

      if (available <= 0) {
        Alert.alert('Out of Stock', `${item.name} has no stock at this branch.`);
        return false;
      }
      if (inCart + 1 > available) {
        Alert.alert(
          'Insufficient Stock',
          `${item.name} has ${available} available and ${inCart} already in the cart.`,
        );
        return false;
      }
    }

    return true;
  }, [cartLines, showToast]);

  const addItemToCart = useCallback((item: CatalogItem, overridePrice?: number) => {
    if (!canAddItemToCart(item, overridePrice)) return false;

    addLine({
      serverId: item.serverId,
      name: item.name,
      sku: item.sku,
      mnemonicSku: item.mnemonicSku,
      barcode: item.barcode,
      unitPrice: overridePrice ?? item.unitPrice,
      availableStock: item.stockLevel - item.reservedLevel,
      isSerialized: item.isSerialized,
      isTire: item.isTire,
      warrantyMonths: item.warrantyMonths,
    });
    recordRecentProduct({
      id: item.serverId,
      name: item.name,
      sku: item.sku || item.mnemonicSku,
      barcode: item.barcode,
      retailPrice: overridePrice ?? item.unitPrice,
      available: item.stockLevel - item.reservedLevel,
      reorderPoint: item.reorderPoint,
    });
    showToast(`Added: ${item.name}`);
    return true;
  }, [addLine, canAddItemToCart, showToast]);

  const loadVariants = useCallback(async (parent: CatalogItem) => {
    setVariantParent(parent);
    setLoadingVariants(true);
    try {
      const productCollection = database.get<Product>('products');
      const inventoryCollection = database.get<Inventory>('inventory');
      const children = await productCollection
        .query(Q.where('parent_product_id', parent.serverId))
        .fetch();

      // Batch fetch inventory for all variants in a single query
      const childServerIds = children.map(p => p.serverId);
      const invMap = new Map<string, { stockLevel: number; reservedLevel: number; reorderPoint: number; availableForSale: boolean }>();

      if (locationId && childServerIds.length > 0) {
        const allInventory = await inventoryCollection
          .query(
            Q.where('product_server_id', Q.oneOf(childServerIds)),
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

      const items: CatalogItem[] = children.map(p => {
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
          isParent: false,
          parentProductId: p.parentProductId,
          isSerialized: p.isSerialized ?? false,
          isTire: p.isTire ?? false,
          warrantyMonths: p.warrantyMonths ?? null,
          stockLevel: inv?.stockLevel ?? 0,
          reservedLevel: inv?.reservedLevel ?? 0,
          reorderPoint: inv?.reorderPoint ?? 10,
          availableForSale: inv?.availableForSale ?? false,
        };
      }).filter(item =>
        item.availableForSale &&
        (item.isVariablePrice || getAvailableQty(item) > 0) &&
        (item.unitPrice > 0 || item.isVariablePrice)
      );
      setVariantChildren(items);
    } catch (err) {
      console.error('[CatalogScreen] Error loading variants:', err);
      setVariantChildren([]);
    } finally {
      setLoadingVariants(false);
    }
  }, [locationId, showToast]);

  const handleVariantSelect = useCallback((variant: CatalogItem) => {
    if (!variant.availableForSale) {
      Alert.alert('Not Available', `${variant.name} is not available for sale at this branch.`);
      return;
    }
    if (variant.isVariablePrice) {
      setVariantParent(null);
      setVariablePriceItem(variant);
      setEnteredPrice('');
      return;
    }
    if (addItemToCart(variant)) {
      setVariantParent(null);
      setVariantChildren([]);
    }
  }, [addItemToCart]);

  const handleVariantPickerClose = useCallback(() => {
    setVariantParent(null);
    setVariantChildren([]);
  }, []);

  const handleBarcodeResult = useCallback(async (barcode: string): Promise<boolean> => {
    const trimmed = barcode.trim();
    if (!trimmed) return false;

    const product = await searchByBarcode(trimmed);
    if (product) {
      if (product.isParent) {
        loadVariants(product);
        return true;
      }
      if (product.isVariablePrice) {
        setVariablePriceItem(product);
        setEnteredPrice('');
        return true;
      }
      if (!product.availableForSale) {
        Alert.alert('Not Available', `${product.name} is not available for sale at this location.`);
        return false;
      }
      return addItemToCart(product);
    }

    Alert.alert('Not Found', `No product found for barcode ${trimmed}`);
    return false;
  }, [searchByBarcode, loadVariants, addItemToCart]);

  // Start scanner listening when on this screen
  useEffect(() => {
    scanner.startListening();
    const unsub = scanner.onScan(async (result) => {
      if (result.barcode === '__OPEN_CAMERA__') return;
      await handleBarcodeResult(result.barcode);
    });
    return () => {
      scanner.stopListening();
      unsub();
    };
  }, [scanner, handleBarcodeResult]);

  const handleProductPress = useCallback((item: CatalogItem) => {
    if (item.isParent) {
      loadVariants(item);
      return;
    }
    if (item.isVariablePrice) {
      setVariablePriceItem(item);
      setEnteredPrice('');
      return;
    }
    addItemToCart(item);
  }, [addItemToCart, loadVariants]);

  // Product detail sheet state
  const [detailProduct, setDetailProduct] = useState<CatalogItem | null>(null);

  const handleProductLongPress = useCallback((item: CatalogItem) => {
    setDetailProduct(item);
  }, []);

  const handleFavoriteAddToCart = useCallback((product: { id: string; name: string; retailPrice: number }) => {
    // Find the full CatalogItem from results for sku/barcode info
    const item = results.find(r => r.serverId === product.id);
    if (item) {
      if (!item.availableForSale) {
        Alert.alert('Not Available', `${item.name} is not available for sale at this branch.`);
        return;
      }
      if (item.isVariablePrice) {
        setVariablePriceItem(item);
        setEnteredPrice('');
        return;
      }
      addItemToCart(item);
    } else {
      // Product not in current results (e.g., filtered by category) — don't add corrupt line
      Alert.alert('Product Unavailable', 'Switch to "All" category to add this item.');
      return;
    }
  }, [results, addItemToCart]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runFullSync();
      await refresh();
    } catch (err) {
      console.error('[CatalogScreen] Sync failed:', err);
      Alert.alert('Sync Failed', 'Catalog sync did not complete. Check the server connection and try again.');
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleScanButton = useCallback(() => {
    setScanModalVisible(true);
    showToast('Scan barcode or type it in');
  }, [showToast]);

  const handleSearchSubmit = useCallback(async () => {
    const value = query.trim();
    if (value.length < 4) return;
    const matched = await handleBarcodeResult(value);
    if (matched) setQuery('');
  }, [query, handleBarcodeResult, setQuery]);

  useEffect(() => {
    const value = query.trim();
    if (!/^[A-Za-z0-9-]{8,}$/.test(value)) return;

    const timer = setTimeout(async () => {
      const product = await searchByBarcode(value);
      if (!product) return;

      const matched = await handleBarcodeResult(value);
      if (matched) setQuery('');
    }, 120);

    return () => clearTimeout(timer);
  }, [query, searchByBarcode, handleBarcodeResult, setQuery]);

  const handleVariablePriceConfirm = useCallback(() => {
    if (!variablePriceItem) return;
    const price = parseFloat(enteredPrice);
    if (isNaN(price) || price <= 0) return;
    if (addItemToCart(variablePriceItem, price)) {
      setVariablePriceItem(null);
      setEnteredPrice('');
    }
  }, [variablePriceItem, enteredPrice, addItemToCart]);

  const handleVariablePriceCancel = useCallback(() => {
    setVariablePriceItem(null);
    setEnteredPrice('');
  }, []);

  const isValidPrice = (() => {
    const price = parseFloat(enteredPrice);
    return !isNaN(price) && price > 0;
  })();

  const renderItem = useCallback(({ item, index }: { item: CatalogItem; index: number }) => (
    <ProductListItem item={item} index={index} onPress={handleProductPress} onLongPress={handleProductLongPress} />
  ), [handleProductPress, handleProductLongPress]);

  return (
    <View
      style={styles.container}
      testID="pos-catalog-screen"
      accessibilityLabel="POS catalog screen"
    >
      {/* Header — hide Cart button on tablet (cart panel is visible) */}
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        <Text style={styles.headerTitle}>Catalog</Text>
        {!isTablet && (
          <Pressable
            style={styles.cartButton}
            onPress={() => navigation.navigate('Cart')}
            android_ripple={{ color: colors.accent.glow }}
          >
            <Icon name="cart" size={18} color={colors.accent.primary} />
            {lineCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{lineCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

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
          <Icon name="search" size={18} color={colors.text.muted} />
          <TextInput
            ref={searchInputRef}
            testID="catalog-search-input"
            accessibilityLabel="Catalog search"
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
            onSubmitEditing={handleSearchSubmit}
            blurOnSubmit={false}
          />
          <Pressable
            testID="catalog-scan-button"
            accessibilityLabel="Scan catalog barcode"
            style={styles.scanButton}
            onPress={handleScanButton}
            android_ripple={{ color: colors.accent.glow, borderless: true }}
          >
            <Icon name="barcode" size={16} color={colors.accent.primary} />
            <Text style={styles.scanButtonText}>SCAN</Text>
          </Pressable>
        </View>
      </View>

      {/* Product family filter tabs — only show when taxonomy is well-populated */}
      {families.length >= 10 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={[styles.chipRow, { paddingHorizontal: screenPadding }]}
        >
          <Chip
            label="All"
            active={!category}
            onPress={() => setCategory(null)}
          />
          {families.map(fam => (
            <Chip
              key={fam}
              label={fam}
              active={category === fam}
              onPress={() => setCategory(category === fam ? null : fam)}
            />
          ))}
        </ScrollView>
      )}

      {/* Product list with alternating rows */}
      <FlatList
        data={results}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <FavoritesGrid productMap={productMap} onAddToCart={handleFavoriteAddToCart} />
        }
        contentContainerStyle={styles.listContent}
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
          isSearching ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
              <Text style={[styles.emptyText, { marginTop: spacing.md }]}>Loading catalog...</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Catalog did not load</Text>
              <Text style={styles.emptySubtitle}>{error}</Text>
              <View style={styles.emptyActions}>
                <Button
                  title="Retry"
                  variant="secondary"
                  fullWidth
                  onPress={() => { refresh(); }}
                  style={{ minHeight: 52 }}
                />
                <Button
                  title="Sync Now"
                  variant="primary"
                  fullWidth
                  onPress={handleRefresh}
                  loading={refreshing}
                  style={{ minHeight: 52 }}
                />
              </View>
            </View>
          ) : query ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No products match &apos;{query}&apos;</Text>
              <Button
                title="Clear Search"
                variant="secondary"
                onPress={() => setQuery('')}
                style={{ marginTop: spacing.md }}
              />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{'\uD83D\uDCE6'}</Text>
              <Text style={styles.emptyTitle}>No products yet</Text>
              <Text style={styles.emptySubtitle}>
                Sync your catalog from the server to start selling.
              </Text>
              <Button
                title="Sync Now"
                variant="primary"
                fullWidth
                onPress={handleRefresh}
                loading={refreshing}
                style={{ marginTop: spacing.lg, maxWidth: 280, minHeight: 52 }}
              />
            </View>
          )
        }
        initialNumToRender={30}
        maxToRenderPerBatch={20}
        windowSize={10}
      />

      {/* Variable Price Modal */}
      <Modal
        visible={variablePriceItem !== null}
        transparent
        animationType="fade"
        onRequestClose={handleVariablePriceCancel}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Enter Price</Text>
            <Text style={styles.modalProductName} numberOfLines={2}>
              {variablePriceItem?.name}
            </Text>

            <View style={styles.modalInputRow}>
              <Text style={styles.modalCurrency}>{'\u20B1'}</Text>
              <TextInput
                style={styles.modalInput}
                value={enteredPrice}
                onChangeText={setEnteredPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
                autoFocus
                selectionColor={colors.accent.primary}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={handleVariablePriceCancel}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirmButton,
                  !isValidPrice && styles.modalConfirmButtonDisabled,
                ]}
                onPress={handleVariablePriceConfirm}
                disabled={!isValidPrice}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Text style={styles.modalConfirmText}>Add to Cart</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Variant Picker Modal */}
      <Modal
        visible={variantParent !== null}
        transparent
        animationType="slide"
        onRequestClose={handleVariantPickerClose}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.variantPickerContainer}>
            <View style={styles.variantPickerHeader}>
              <Text style={styles.modalTitle}>Select Variant</Text>
              <Pressable onPress={handleVariantPickerClose}>
                <Text style={styles.variantCloseText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalProductName} numberOfLines={2}>
              {variantParent?.name}
            </Text>

            {loadingVariants ? (
              <ActivityIndicator
                size="large"
                color={colors.accent.primary}
                style={{ paddingVertical: spacing.xl }}
              />
            ) : variantChildren.length === 0 ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <Text style={styles.emptyText}>No variants found</Text>
              </View>
            ) : (
              <FlatList
                data={variantChildren}
                keyExtractor={item => item.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => {
                  // Strip parent name prefix for cleaner display
                  const label = item.name.startsWith(variantParent?.name ?? '')
                    ? item.name.slice((variantParent?.name ?? '').length).replace(/^\s*[-–—]\s*/, '').trim() || item.name
                    : item.name;
                  return (
                    <Pressable
                      style={styles.variantRow}
                      onPress={() => handleVariantSelect(item)}
                      android_ripple={{ color: colors.accent.glow }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.variantName} numberOfLines={1}>{label}</Text>
                        <Text style={styles.variantSku}>{item.sku}</Text>
                      </View>
                      <Text style={styles.variantPrice}>
                        {item.isVariablePrice ? 'Variable' : `\u20B1${item.unitPrice.toFixed(2)}`}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Product Detail Sheet — opened on long-press */}
      <ProductDetailSheet
        product={detailProduct}
        visible={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        onAddToCart={addItemToCart}
      />

      <BarcodeScanModal
        visible={scanModalVisible}
        title="Scan Item Barcode"
        subtitle="Use the paired scanner, or type the item barcode manually."
        actionLabel="Find Item"
        onSubmit={handleBarcodeResult}
        onClose={() => setScanModalVisible(false)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg.primary,
  },
  headerTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
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
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    height: 54,
  },
  searchInputContainerFocused: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.bg.surface,
  },
  searchIcon: {
    marginRight: spacing.sm,
    color: colors.text.muted,
    fontSize: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Outfit-Regular',
    color: colors.text.primary,
  },
  scanButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginLeft: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scanButtonText: {
    color: colors.text.inverse,
    fontSize: 13,
    fontFamily: 'Outfit-Bold',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },

  // ── Category chips ──
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingRight: 40,
    gap: spacing.sm,
  },

  // ── Empty state ──
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing['2xl'],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  emptyActions: {
    width: '100%',
    maxWidth: 280,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },

  // ── Variable Price Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  modalTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  modalProductName: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  modalCurrency: {
    ...textStyles.heading,
    color: colors.text.muted,
    paddingLeft: spacing.md,
  },
  modalInput: {
    flex: 1,
    ...textStyles.heading,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
  },
  modalCancelText: {
    ...textStyles.body,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    opacity: 0.4,
  },
  modalConfirmText: {
    ...textStyles.body,
    color: colors.text.inverse,
    fontWeight: '700',
  },

  // ── Variant Picker Modal ──
  variantPickerContainer: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border.default,
    maxHeight: '70%',
  },
  variantPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  variantCloseText: {
    ...textStyles.body,
    color: colors.accent.primary,
    fontWeight: '600',
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  variantName: {
    ...textStyles.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  variantSku: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  variantPrice: {
    ...textStyles.body,
    color: colors.accent.primary,
    fontWeight: '700',
    marginLeft: spacing.md,
  },
});
