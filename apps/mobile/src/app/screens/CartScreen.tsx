import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import {
  useCartStore,
  selectSubtotal,
  selectCartDiscount,
  selectGrandTotal,
  selectLineCount,
  type CartLine,
} from '@/stores/cart-store';
import { CustomerLookup } from '@/components/CustomerLookup';
import type { Customer, Vehicle } from '@/hooks/use-customer-search';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, radius, layout, fonts, fontSize, touchTarget } from '@/theme';
import { Button, Card } from '@/components/ui';

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CartScreenProps {
  onProceedToPayment?: () => void; // tablet: callback to swap panel to PaymentScreen
}

export default function CartScreen({ onProceedToPayment }: CartScreenProps) {
  const navigation = useNavigation();
  const { isTablet, screenPadding } = useLayout();

  const lines = useCartStore(s => s.lines);
  const customerId = useCartStore(s => s.customerId);
  const customerName = useCartStore(s => s.customerName);
  const vehicleId = useCartStore(s => s.vehicleId);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const removeLine = useCartStore(s => s.removeLine);
  const setAllowNegativeStock = useCartStore(s => s.setAllowNegativeStock);
  const clear = useCartStore(s => s.clear);

  const subtotal = useCartStore(selectSubtotal);
  const discount = useCartStore(selectCartDiscount);
  const grandTotal = useCartStore(selectGrandTotal);
  const lineCount = useCartStore(selectLineCount);

  const attachCustomer = useCartStore(s => s.attachCustomer);
  const detachCustomer = useCartStore(s => s.detachCustomer);

  const [customerLookupVisible, setCustomerLookupVisible] = useState(false);

  const handleSelectCustomer = useCallback((customer: Customer, vehicle?: Vehicle) => {
    attachCustomer(customer.id, customer.name, vehicle?.id);
  }, [attachCustomer]);

  const proceedToPayment = useCallback(() => {
    if (onProceedToPayment) {
      onProceedToPayment();
    } else {
      navigation.navigate('Payment' as never);
    }
  }, [onProceedToPayment, navigation]);

  const handleProceedToPayment = useCallback(() => {
    const lowStockLines = lines.filter(
      l => l.availableStock !== null && l.availableStock < l.quantity,
    );

    if (lowStockLines.length > 0) {
      const itemList = lowStockLines
        .map(l => {
          const avail = l.availableStock ?? 0;
          const deficit = l.quantity - avail;
          return avail <= 0
            ? `• ${l.name} — OUT OF STOCK (qty ${l.quantity})`
            : `• ${l.name} — need ${l.quantity}, only ${avail} avail (−${deficit})`;
        })
        .join('\n');

      Alert.alert(
        'Insufficient Stock',
        `The following items will go into negative inventory:\n\n${itemList}\n\nProceed anyway?`,
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Proceed', style: 'destructive', onPress: () => {
            setAllowNegativeStock(true);
            proceedToPayment();
          }},
        ],
      );
      return;
    }

    setAllowNegativeStock(false);
    proceedToPayment();
  }, [lines, proceedToPayment, setAllowNegativeStock]);

  // Check for stock warnings
  const hasStockWarnings = lines.some(
    l => l.availableStock !== null && l.availableStock < l.quantity,
  );

  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const handleMinusPress = useCallback((item: CartLine) => {
    if (item.quantity <= 1) {
      Alert.alert('Remove Item', `Remove ${item.name} from cart?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeLine(item.id) },
      ]);
    } else {
      updateQuantity(item.id, item.quantity - 1);
    }
  }, [updateQuantity, removeLine]);

  const renderRightActions = useCallback((lineId: string, lineName: string) => (
    <Pressable
      style={styles.swipeDelete}
      onPress={() => {
        Alert.alert('Remove Item', `Remove ${lineName}?`, [
          { text: 'Cancel', style: 'cancel', onPress: () => swipeableRefs.current.get(lineId)?.close() },
          { text: 'Remove', style: 'destructive', onPress: () => removeLine(lineId) },
        ]);
      }}
    >
      <Text style={styles.swipeDeleteText}>Delete</Text>
    </Pressable>
  ), [removeLine]);

  const renderLine = ({ item }: { item: CartLine }) => {
    const isLowStock = item.availableStock !== null && item.availableStock < item.quantity;
    const isOutOfStock = item.availableStock !== null && item.availableStock <= 0;
    return (
      <Swipeable
        ref={(ref) => { if (ref) swipeableRefs.current.set(item.id, ref); }}
        renderRightActions={() => renderRightActions(item.id, item.name)}
        overshootRight={false}
      >
        <Card style={styles.lineCard} padded={false}>
          <View style={styles.lineContent}>
            <View style={styles.lineInfo}>
              <Text style={styles.lineName} numberOfLines={1}>{item.name}</Text>
              <View style={styles.lineMetaRow}>
                <Text style={styles.lineSku}>{item.mnemonicSku}</Text>
                {isOutOfStock && (
                  <View style={styles.stockBadgeOut}>
                    <Text style={styles.stockBadgeOutText}>OUT OF STOCK</Text>
                  </View>
                )}
                {!isOutOfStock && isLowStock && (
                  <View style={styles.stockBadgeLow}>
                    <Text style={styles.stockBadgeLowText}>Only {item.availableStock} avail.</Text>
                  </View>
                )}
              </View>
              <Text style={styles.lineUnitPrice}>{fmtPHP(item.unitPrice)} x {item.quantity}</Text>
            </View>
            <View style={styles.qtyControls}>
              <Pressable
                style={[styles.qtyBtn, item.quantity <= 1 && styles.qtyBtnDanger]}
                onPress={() => handleMinusPress(item)}
                hitSlop={8}
              >
                <Text style={styles.qtyBtnText}>{item.quantity <= 1 ? '\uD83D\uDDD1' : '\u2212'}</Text>
              </Pressable>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => updateQuantity(item.id, item.quantity + 1)}
                hitSlop={8}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
            <Text style={styles.lineTotal}>{fmtPHP(item.lineTotal)}</Text>
          </View>
        </Card>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header — tablet: no Back button (persistent panel) */}
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        {!isTablet ? (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.headerTouchTarget}
          >
            <Text style={styles.backText}>{'\u2190'} Back</Text>
          </Pressable>
        ) : (
          <Text style={styles.panelTitle}>Cart</Text>
        )}
        <Text style={isTablet ? styles.cartCount : styles.headerTitle}>
          {isTablet ? `${lineCount} items` : `Cart (${lineCount})`}
        </Text>
        <Pressable
          onPress={() => {
            if (lines.length > 0) {
              Alert.alert('Clear Cart', 'Remove all items?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clear },
              ]);
            }
          }}
          hitSlop={8}
          style={styles.headerTouchTarget}
        >
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>

      {/* Customer bar */}
      {customerName ? (
        <Card style={styles.customerCard} padded={false}>
          <View style={styles.customerBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customerName}</Text>
              {vehicleId && (
                <Text style={styles.customerVehicle}>Vehicle attached</Text>
              )}
            </View>
            <Pressable onPress={detachCustomer} hitSlop={8}>
              <Text style={styles.detachText}>✕</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable
          style={styles.addCustomerButton}
          onPress={() => setCustomerLookupVisible(true)}
          android_ripple={{ color: colors.accent.glow }}
        >
          <Text style={styles.addCustomerText}>+ Add Customer</Text>
        </Pressable>
      )}

      {/* Line items */}
      <FlatList
        data={lines}
        keyExtractor={item => item.id}
        renderItem={renderLine}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Cart is empty</Text>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          lines.length === 0 ? { flex: 1 } : undefined,
        ]}
      />

      {/* Footer — totals + proceed to payment */}
      {lines.length > 0 && (
        <View style={styles.footer}>
          {/* Totals */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtPHP(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalValue, { color: colors.status.danger }]}>-{fmtPHP(discount)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{fmtPHP(grandTotal)}</Text>
          </View>

          {/* Stock warnings summary */}
          {hasStockWarnings && (
            <Text style={styles.stockWarning}>
              ⚠ Some items have insufficient stock
            </Text>
          )}

          {/* Proceed to Payment button */}
          <Button
            title={`Proceed to Payment  \u2192`}
            variant="primary"
            fullWidth
            onPress={handleProceedToPayment}
            style={styles.proceedButton}
            textStyle={styles.proceedButtonText}
          />
        </View>
      )}

      <CustomerLookup
        visible={customerLookupVisible}
        onClose={() => setCustomerLookupVisible(false)}
        onSelect={handleSelectCustomer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ── Layout ──
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
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    minHeight: 56,
  },
  headerTouchTarget: {
    minWidth: 52,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  headerTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  panelTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
  },
  cartCount: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  clearText: {
    ...textStyles.bodyMedium,
    color: colors.status.danger,
  },

  // ── Customer bar ──
  customerCard: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent.primary,
  },
  customerBar: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  detachText: {
    ...textStyles.body,
    color: colors.text.muted,
    paddingHorizontal: spacing.sm,
  },
  addCustomerButton: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addCustomerText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  customerName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  customerVehicle: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  // ── Line items ──
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  lineCard: {
    overflow: 'hidden',
  },
  lineContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  lineInfo: {
    flex: 1,
  },
  lineName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  lineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  lineSku: {
    ...textStyles.monoSm,
    color: colors.text.muted,
  },
  stockBadgeOut: {
    backgroundColor: colors.status.dangerBg,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  stockBadgeOutText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xs,
    color: colors.status.danger,
    letterSpacing: 0.5,
  },
  stockBadgeLow: {
    backgroundColor: colors.status.warningBg,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  stockBadgeLowText: {
    fontFamily: fonts.display.medium,
    fontSize: fontSize.xs,
    color: colors.status.warning,
  },
  lineUnitPrice: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: spacing.xs,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
  },
  qtyBtn: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnDanger: {
    backgroundColor: colors.status.danger,
  },
  qtyBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
    color: colors.text.inverse,
  },
  qtyText: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    marginHorizontal: spacing.md,
    minWidth: 24,
    textAlign: 'center',
  },
  lineTotal: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    minWidth: 80,
    textAlign: 'right',
  },

  // ── Empty state ──
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.secondary,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    backgroundColor: colors.bg.surface,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  totalValue: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  grandTotalLabel: {
    ...textStyles.subheading,
    color: colors.text.primary,
  },
  grandTotalValue: {
    ...textStyles.monoLg,
    color: colors.accent.primary,
  },

  // ── Swipe to delete ──
  swipeDelete: {
    backgroundColor: colors.status.danger,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  swipeDeleteText: {
    ...textStyles.bodyMedium,
    color: colors.white,
  },

  // ── Stock warning ──
  stockWarning: {
    ...textStyles.caption,
    color: colors.status.warning,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  // ── Proceed to Payment button ──
  proceedButton: {
    marginTop: spacing.md,
    minHeight: 56,
  },
  proceedButtonText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
  },
});
