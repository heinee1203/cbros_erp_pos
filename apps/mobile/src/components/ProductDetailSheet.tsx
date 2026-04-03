import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { BottomSheet } from '@/components/ui';
import { apiFetch } from '@/services/api-client';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { usePrinter } from '@/hardware/printer/context';
import { buildShelfLabel, zplToBytes } from '@/hardware/printer/zpl-label-builder';
import { colors, textStyles, spacing } from '@/theme';
import { useTheme } from '@/theme/ThemeContext';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
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
  onAddToCart: (product: CatalogItem) => void;
}

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ProductDetailSheet({ product, visible, onClose, onAddToCart }: Props) {
  useTheme(); // Subscribe to theme changes
  const styles = createStyles();
  const { isOnline } = useNetworkStatus();
  const printer = usePrinter();
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const currentLocationId = storage.getString(KEYS.AUTH_LOCATION_ID) || '';

  useEffect(() => {
    if (!visible || !product) {
      setStockData(null);
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

  const handleAdd = () => {
    onAddToCart(product);
    onClose();
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

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          style={[styles.addButton, { flex: 1 }]}
          onPress={handleAdd}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={styles.addButtonText}>Add to Cart</Text>
        </Pressable>
        <Pressable
          style={[styles.addButton, { flex: 0, paddingHorizontal: 16, backgroundColor: colors.bg.elevated }]}
          onPress={async () => {
            if (!product) return;
            try {
              const zpl = buildShelfLabel({
                itemName: product.name,
                barcode: product.barcode,
              });
              const data = zplToBytes(zpl);
              const result = await printer.printRaw(data);
              if (!result.success) {
                // Fallback: try server-side print
                await apiFetch('/printing/zpl/send', {
                  method: 'POST',
                  body: JSON.stringify({ zpl }),
                });
              }
            } catch {
              // Silent fail — label printing is best-effort
            }
          }}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={[styles.addButtonText, { color: colors.text.primary }]}>🏷️</Text>
        </Pressable>
      </View>
    </BottomSheet>
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
    letterSpacing: 1,
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
    letterSpacing: 1,
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
  addButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  addButtonText: {
    ...textStyles.button,
    color: '#FFFFFF',
  },
});
