import React, { useEffect, useState } from 'react';
import { Alert, View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { BottomSheet, Icon } from '@/components/ui';
import { LabelPreviewModal } from '@/components/LabelPreviewModal';
import { apiFetch } from '@/services/api-client';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { usePrinter } from '@/hardware/printer/context';
import { buildShelfLabel } from '@/hardware/printer/zpl-label-builder';
import { printZplSafely } from '@/hardware/printer/settings';
import { colors, textStyles, spacing, radius } from '@/theme';
import { useTheme } from '@/theme/ThemeContext';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getLockedLocationId } from '@/config/device-binding';
import type { CatalogItem } from '@/hooks/use-catalog-search';

interface StockLocation {
  locationId: string;
  locationName: string;
  quantity: number;
  reserved: number;
}

interface StockData {
  productId: string;
  locations: StockLocation[];
  totalStock: number;
}

interface Props {
  product: CatalogItem | null;
  visible: boolean;
  onClose: () => void;
  onAddToCart: (product: CatalogItem) => boolean;
  showAddToCart?: boolean;
  addToCartLabel?: string;
  footerActions?: React.ReactNode;
}

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ProductDetailSheet({
  product,
  visible,
  onClose,
  onAddToCart,
  showAddToCart = true,
  addToCartLabel = 'Add to Cart',
  footerActions,
}: Props) {
  useTheme(); // Subscribe to theme changes
  const styles = createStyles();
  const { isOnline } = useNetworkStatus();
  const printer = usePrinter();
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);
  const [labelPreviewVisible, setLabelPreviewVisible] = useState(false);
  const currentLocationId = getLockedLocationId() ?? storage.getString(KEYS.AUTH_LOCATION_ID) ?? '';

  useEffect(() => {
    if (!visible || !product) {
      setStockData(null);
      setLabelPreviewVisible(false);
      return;
    }

    if (!isOnline) return; // Skip API call when offline

    setLoading(true);
    apiFetch<StockData>(`/products/${product.serverId}/stock`)
      .then(setStockData)
      .catch(() => {}) // Silently fail — offline indicator handles UX
      .finally(() => setLoading(false));
  }, [visible, product?.serverId, isOnline]);

  if (!product) return null;

  const labelZpl = product.barcode ? buildShelfLabel({
    itemName: product.name,
    barcode: product.barcode,
    sku: product.sku || product.mnemonicSku,
    price: product.unitPrice,
  }) : '';

  const handleAdd = () => {
    if (onAddToCart(product)) {
      onClose();
    }
  };

  const handlePrintLabel = async () => {
    if (!product) return;
    if (!product.barcode) {
      Alert.alert('No Barcode', 'This product does not have a barcode to print.');
      return;
    }

    setPrintingLabel(true);
    try {
      const result = await printZplSafely(printer, labelZpl);
      if (!result.success) {
        Alert.alert('Label Not Printed', result.error || 'Connect a ZPL label printer before printing.', [
          { text: 'Preview Label', onPress: () => setLabelPreviewVisible(true) },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Label Sent', 'Barcode label was sent to the printer.');
      }
    } catch (err: any) {
      Alert.alert('Print Failed', err.message || 'Label could not be printed.');
    } finally {
      setPrintingLabel(false);
    }
  };

  // Sort: current location first, then alphabetical
  const sortedLocations = stockData?.locations
    .slice()
    .sort((a, b) => {
      if (a.locationId === currentLocationId) return -1;
      if (b.locationId === currentLocationId) return 1;
      return a.locationName.localeCompare(b.locationName);
    }) ?? [];

  return (
    <>
    <BottomSheet visible={visible} onClose={onClose} title={product.name}>
      {/* SKU + Price */}
      <View style={styles.meta}>
        <Text style={styles.sku}>SKU: {product.sku || '—'}</Text>
        <Text style={styles.price}>{fmtPHP(product.unitPrice)}</Text>
      </View>

      {product.barcode ? (
        <Text style={styles.barcode}>Barcode: {product.barcode}</Text>
      ) : null}

      {/* Stock by Location */}
      <Text style={styles.sectionHeader}>STOCK BY LOCATION</Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Loading stock…</Text>
        </View>
      ) : !isOnline ? (
        <View style={styles.offlineRow}>
          <Text style={styles.offlineText}>Offline — showing local stock only</Text>
          <View style={styles.stockRow}>
            <View style={styles.stockLeft}>
              <View style={[styles.dot, { backgroundColor: product.stockLevel > 0 ? colors.status.ok : colors.status.out }]} />
              <Text style={[styles.locationName, styles.currentLocation]}>
                Current Location
              </Text>
            </View>
            <Text style={[styles.stockQty, { color: product.stockLevel > 0 ? colors.status.ok : colors.text.muted }]}>
              {product.stockLevel}
            </Text>
          </View>
        </View>
      ) : stockData ? (
        <View>
          {sortedLocations.map((loc) => (
            <View key={loc.locationId} style={styles.stockRow}>
              <View style={styles.stockLeft}>
                <View style={[styles.dot, { backgroundColor: loc.quantity > 0 ? colors.status.ok : colors.status.out }]} />
                <Text style={[
                  styles.locationName,
                  loc.locationId === currentLocationId && styles.currentLocation,
                ]}>
                  {loc.locationName}
                  {loc.locationId === currentLocationId ? ' (You)' : ''}
                </Text>
              </View>
              <Text style={[
                styles.stockQty,
                { color: loc.quantity > 0 ? colors.status.ok : colors.text.muted },
              ]}>
                {loc.quantity}
              </Text>
            </View>
          ))}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalQty}>{stockData.totalStock}</Text>
          </View>
        </View>
      ) : null}

      {footerActions ? (
        <View style={styles.footerActions}>
          {footerActions}
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actions}>
        {showAddToCart ? (
          <Pressable
            style={[styles.addButton, styles.primaryAction]}
            onPress={handleAdd}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <Text style={styles.addButtonText}>{addToCartLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[
            styles.addButton,
            styles.labelButton,
            !showAddToCart && styles.labelButtonWide,
            printingLabel && styles.buttonDisabled,
          ]}
          onPress={handlePrintLabel}
          onLongPress={() => product.barcode && setLabelPreviewVisible(true)}
          disabled={printingLabel}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          accessibilityLabel="Print barcode label"
        >
          {printingLabel ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <View style={styles.labelButtonContent}>
              <Icon name="barcode" size={20} color={colors.text.primary} />
              {!showAddToCart ? (
                <Text style={styles.labelButtonText}>Print Label</Text>
              ) : null}
            </View>
          )}
        </Pressable>
      </View>
    </BottomSheet>
    {product.barcode ? (
      <LabelPreviewModal
        visible={labelPreviewVisible}
        itemName={product.name}
        sku={product.sku || product.mnemonicSku}
        barcode={product.barcode}
        price={product.unitPrice}
        zpl={labelZpl}
        onClose={() => setLabelPreviewVisible(false)}
        onPrint={handlePrintLabel}
        printing={printingLabel}
        statusLabel={printer.isConnected ? undefined : 'Connect a ZPL label printer before printing.'}
      />
    ) : null}
    </>
  );
}

const createStyles = () => StyleSheet.create({
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sku: {
    ...textStyles.caption,
    color: colors.text.muted,
    fontFamily: 'DMSans-Regular',
  },
  price: {
    ...textStyles.heading,
    color: colors.accent.primary,
  },
  barcode: {
    ...textStyles.caption,
    color: colors.text.muted,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    ...textStyles.label,
    color: colors.text.muted,
    letterSpacing: 0,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  stockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  locationName: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  currentLocation: {
    fontFamily: 'Outfit-SemiBold',
  },
  stockQty: {
    ...textStyles.body,
    fontFamily: 'Outfit-SemiBold',
    minWidth: 30,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  totalLabel: {
    ...textStyles.label,
    color: colors.text.muted,
    letterSpacing: 0,
  },
  totalQty: {
    ...textStyles.heading,
    color: colors.text.primary,
    minWidth: 30,
    textAlign: 'right',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.text.muted,
  },
  offlineRow: {
    paddingVertical: spacing.sm,
  },
  offlineText: {
    ...textStyles.caption,
    color: colors.status.warning,
    marginBottom: spacing.sm,
  },
  footerActions: {
    marginTop: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  addButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: {
    flex: 1,
  },
  labelButton: {
    flex: 0,
    paddingHorizontal: 16,
    backgroundColor: colors.bg.elevated,
  },
  labelButtonWide: {
    flex: 1,
  },
  labelButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  labelButtonText: {
    ...textStyles.button,
    color: colors.text.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    ...textStyles.button,
    color: '#FFFFFF',
  },
});
