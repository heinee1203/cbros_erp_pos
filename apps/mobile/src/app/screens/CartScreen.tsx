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

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CartScreenProps {
  onProceedToPayment?: () => void;
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
  const unitCount = useCartStore(selectLineCount);
  const productCount = lines.length;

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
            ? `\u2022 ${l.name} \u2014 OUT OF STOCK (qty ${l.quantity})`
            : `\u2022 ${l.name} \u2014 need ${l.quantity}, only ${avail} avail (\u2212${deficit})`;
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

  const hasStockWarnings = lines.some(
    l => l.availableStock !== null && l.availableStock < l.quantity,
  );

  // VAT calculation (12% inclusive)
  const vatAmount = grandTotal - (grandTotal / 1.12);

  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const styles = createStyles();

  const handleMinusPress = useCallback((item: CartLine) => {
    if (item.quantity <= 1) {
      // Instant remove at qty 1 — no confirmation for speed
      removeLine(item.id);
    } else {
      updateQuantity(item.id, item.quantity - 1);
    }
  }, [updateQuantity, removeLine]);

  const renderRightActions = useCallback((lineId: string, lineName: string) => (
    <Pressable
      style={styles.swipeDelete}
      onPress={() => {
        removeLine(lineId);
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
        <View style={styles.cartLine}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {item.sku ? (
                <Text style={styles.cartLineSKU} numberOfLines={1}>{item.sku}</Text>
              ) : null}
              <Text style={styles.lineTotal}>{fmtPHP(item.lineTotal)}</Text>
            </View>
            <Text style={styles.lineName} numberOfLines={2}>{item.name}</Text>
            <View style={styles.lineMetaRow}>
              <Text style={styles.lineUnitPrice}>{fmtPHP(item.unitPrice)} \u00D7 {item.quantity}</Text>
            </View>
            {isOutOfStock && (
              <View style={[styles.stockBadgeOut, { marginTop: 4 }]}>
                <Text style={styles.stockBadgeOutText}>No Stock</Text>
              </View>
            )}
            {!isOutOfStock && isLowStock && (
              <View style={[styles.stockBadgeLow, { marginTop: 4 }]}>
                <Text style={styles.stockBadgeLowText}>Only {item.availableStock} avail.</Text>
              </View>
            )}
          </View>
          <View style={styles.qtyControls}>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => handleMinusPress(item)}
              hitSlop={8}
            >
              <Text style={styles.qtyBtnText}>{'\u2212'}</Text>
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
        </View>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.cartHeader}>
        {!isTablet ? (
          <>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={8}
              style={styles.headerTouchTarget}
            >
              <Text style={styles.backText}>{'\u2190'} Back</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Cart ({unitCount})</Text>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.cartHeaderTitle}>Cart</Text>
            <Text style={styles.cartHeaderCount}>{productCount} products \u00B7 {unitCount} units</Text>
          </View>
        )}
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
          style={styles.clearButton}
        >
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>

      {/* Customer bar — only when cart has items */}
      {lines.length > 0 && (
        customerName ? (
          <View style={styles.customerSelected}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customerName}</Text>
              {vehicleId && (
                <Text style={styles.customerVehicle}>Vehicle attached</Text>
              )}
            </View>
            <Pressable onPress={detachCustomer} hitSlop={8}>
              <Text style={styles.detachText}>{'\u2715'}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.addCustomerButton}
            onPress={() => setCustomerLookupVisible(true)}
            android_ripple={{ color: colors.accent.glow }}
          >
            <Text style={styles.addCustomerText}>+ Add Customer</Text>
          </Pressable>
        )
      )}

      {/* Scrollable line items */}
      <FlatList
        data={lines}
        keyExtractor={item => item.id}
        renderItem={renderLine}
        style={styles.cartList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDED2'}</Text>
            <Text style={styles.emptyTitle}>No items in cart</Text>
            <Text style={styles.emptySubtitle}>Tap a product or scan a barcode to start</Text>
          </View>
        }
        contentContainerStyle={[
          lines.length === 0 ? { flex: 1 } : undefined,
        ]}
      />

      {/* PINNED footer — always visible, never scrolls */}
      {lines.length > 0 && (
        <View style={styles.cartFooter}>
          {/* Stock warning */}
          {hasStockWarnings && (
            <Text style={styles.stockWarning}>
              {'\u26A0'} Some items have insufficient stock
            </Text>
          )}

          {/* Subtotal / discount rows */}
          {discount > 0 && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{fmtPHP(subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount</Text>
                <Text style={[styles.totalValue, { color: colors.status.danger }]}>-{fmtPHP(discount)}</Text>
              </View>
            </>
          )}

          {/* VAT row */}
          <View style={styles.vatRow}>
            <Text style={styles.vatLabel}>VAT (12% inclusive)</Text>
            <Text style={styles.vatAmount}>{fmtPHP(vatAmount)}</Text>
          </View>

          {/* Grand total */}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>{fmtPHP(grandTotal)}</Text>
          </View>

          {/* Checkout button */}
          <Pressable
            style={styles.checkoutButton}
            onPress={handleProceedToPayment}
            android_ripple={{ color: 'rgba(0,0,0,0.2)' }}
          >
            <Text style={styles.checkoutButtonText}>CHECKOUT</Text>
          </Pressable>
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

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  cartList: {
    flex: 1,
  },

  // Cart Header
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  cartHeaderTitle: {
    fontSize: 18,
    fontFamily: 'Outfit-Bold',
    color: '#F2F0ED',
    letterSpacing: -0.3,
  },
  cartHeaderCount: {
    fontSize: 13,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
    marginLeft: 8,
  },
  headerTouchTarget: {
    minWidth: 52,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Outfit-Medium',
    color: '#F2F0ED',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Outfit-Bold',
    color: '#F2F0ED',
    letterSpacing: -0.3,
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  clearText: {
    fontSize: 13,
    fontFamily: 'Outfit-SemiBold',
    color: '#FF3B30',
  },

  // Customer bar
  customerSelected: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detachText: {
    fontSize: 14,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
    paddingHorizontal: spacing.sm,
  },
  addCustomerButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 12,
    alignItems: 'center',
  },
  addCustomerText: {
    fontSize: 13,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
  },
  customerName: {
    fontSize: 14,
    fontFamily: 'Outfit-Medium',
    color: '#F2F0ED',
  },
  customerVehicle: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: '#5A5750',
    marginTop: 2,
  },

  // Cart Line Items
  cartLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  cartLineSKU: {
    fontSize: 13,
    fontFamily: 'JetBrainsMono-Regular',
    color: '#9B978F',
    flex: 1,
  },
  lineName: {
    fontSize: 14,
    fontFamily: 'Outfit-Medium',
    color: '#F2F0ED',
    marginTop: 2,
    lineHeight: 19,
  },
  lineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: spacing.sm,
  },
  lineSku: {
    ...textStyles.monoSm,
    color: '#5A5750',
  },
  stockBadgeOut: {
    backgroundColor: colors.status.dangerBg,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    alignSelf: 'flex-start',
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
    alignSelf: 'flex-start',
  },
  stockBadgeLowText: {
    fontFamily: fonts.display.medium,
    fontSize: fontSize.xs,
    color: colors.status.warning,
  },
  lineUnitPrice: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: '#5A5750',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  qtyBtn: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
    color: colors.text.inverse,
  },
  qtyText: {
    ...textStyles.monoMd,
    color: '#F2F0ED',
    marginHorizontal: spacing.md,
    minWidth: 24,
    textAlign: 'center',
  },
  lineTotal: {
    fontSize: 16,
    fontFamily: 'Outfit-Bold',
    color: '#F5A623',
    marginLeft: 8,
  },

  // Empty state
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.3,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Outfit-SemiBold',
    color: '#5A5750',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Cart Footer — PINNED
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.bg.elevated,
  },
  vatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  vatLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: '#5A5750',
  },
  vatAmount: {
    fontSize: 12,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#5A5750',
  },
  totalValue: {
    fontSize: 13,
    fontFamily: 'Outfit-Medium',
    color: '#F2F0ED',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontFamily: 'Outfit-Medium',
    color: '#5A5750',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  grandTotalValue: {
    fontSize: 28,
    fontFamily: 'Outfit-Bold',
    color: '#F2F0ED',
    letterSpacing: -0.5,
  },

  // Checkout button
  checkoutButton: {
    backgroundColor: '#F5A623',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  checkoutButtonText: {
    fontSize: 16,
    fontFamily: 'Outfit-Bold',
    color: '#1A1A1A',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Swipe to delete
  swipeDelete: {
    backgroundColor: colors.status.danger,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeDeleteText: {
    fontSize: 13,
    fontFamily: 'Outfit-SemiBold',
    color: '#FFFFFF',
  },

  // Stock warning
  stockWarning: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: colors.status.warning,
    marginBottom: 12,
    textAlign: 'center',
  },
});
