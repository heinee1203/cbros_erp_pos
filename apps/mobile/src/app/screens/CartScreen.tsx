import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  SafeAreaView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';
import {
  useCartStore,
  selectSubtotal,
  selectCartDiscount,
  selectGrandTotal,
  selectLineCount,
  selectIncompleteSerials,
  type CartLine,
} from '@/stores/cart-store';
import { CustomerLookup } from '@/components/CustomerLookup';
import { SerialInput } from '@/components/SerialInput';
import { WarrantyPhotoCapture } from '@/components/WarrantyPhotoCapture';
import { HeldCartsSheet } from '@/components/HeldCartsSheet';
import { ManagerPinModal } from '@/components/ManagerPinModal';
import { getHeldCartCount } from '@/storage/held-carts';
import type { Customer, Vehicle } from '@/hooks/use-customer-search';
import { useLayout } from '@/hooks/use-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { useRequireElevation } from '@/hooks/use-require-elevation';
import { logElevation } from '@/services/audit-logger';
import { formatDotAllocation } from '@/utils/dot-fifo-allocate';
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
  const { can } = usePosPermission();
  const { user } = useAuth();
  const { guard, elevationProps } = useRequireElevation();

  const lines = useCartStore(s => s.lines);
  const customerId = useCartStore(s => s.customerId);
  const customerName = useCartStore(s => s.customerName);
  const vehicleId = useCartStore(s => s.vehicleId);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const removeLine = useCartStore(s => s.removeLine);
  const setAllowNegativeStock = useCartStore(s => s.setAllowNegativeStock);
  const clear = useCartStore(s => s.clear);
  const setLineSerials = useCartStore(s => s.setLineSerials);
  const setLineWarrantyPhoto = useCartStore(s => s.setLineWarrantyPhoto);
  const setLinePriceOverride = useCartStore(s => s.setLinePriceOverride);
  const incompleteSerials = useCartStore(useShallow(selectIncompleteSerials));

  const subtotal = useCartStore(selectSubtotal);
  const discount = useCartStore(selectCartDiscount);
  const grandTotal = useCartStore(selectGrandTotal);
  const unitCount = useCartStore(selectLineCount);
  const productCount = lines.length;

  // Serial input modal state
  const [serialModalLine, setSerialModalLine] = useState<CartLine | null>(null);

  // Price override modal state
  const [priceOverrideTarget, setPriceOverrideTarget] = useState<CartLine | null>(null);
  const [priceOverrideValue, setPriceOverrideValue] = useState('');

  const attachCustomer = useCartStore(s => s.attachCustomer);
  const detachCustomer = useCartStore(s => s.detachCustomer);

  const [customerLookupVisible, setCustomerLookupVisible] = useState(false);
  const [heldCartsSheetVisible, setHeldCartsSheetVisible] = useState(false);

  const holdCurrentCart = useCartStore(s => s.holdCurrentCart);
  const heldCartCount = getHeldCartCount();

  const handleHoldCart = useCallback(() => {
    if (lines.length === 0) return;
    const success = holdCurrentCart();
    if (!success) {
      Alert.alert(
        'Maximum Held Carts',
        'Maximum 5 held carts. Please resume or delete one first.',
      );
    }
  }, [lines.length, holdCurrentCart]);

  const handlePriceOverride = useCallback((item: CartLine) => {
    setPriceOverrideTarget(item);
    setPriceOverrideValue(String(item.overridePrice ?? item.unitPrice));
  }, []);

  const handlePriceOverrideSubmit = useCallback(() => {
    if (!priceOverrideTarget) return;
    const newPrice = parseFloat(priceOverrideValue);
    if (isNaN(newPrice) || newPrice < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }
    const item = priceOverrideTarget;
    const oldPrice = item.overridePrice ?? item.unitPrice;
    setPriceOverrideTarget(null);
    setPriceOverrideValue('');
    guard(
      'priceOverride',
      `Override price on ${item.name}\n${fmtPHP(oldPrice)} \u2192 ${fmtPHP(newPrice)}`,
      (approverName) => {
        setLinePriceOverride(item.id, newPrice, approverName);
        logElevation({
          action: 'price_override',
          description: `Price override on ${item.name} ${fmtPHP(oldPrice)} \u2192 ${fmtPHP(newPrice)}`,
          approvedBy: approverName,
          performedBy: user?.fullName ?? 'Unknown',
          metadata: { lineId: item.id, productId: item.productId, oldPrice, newPrice },
        });
      },
    );
  }, [priceOverrideTarget, priceOverrideValue, guard, setLinePriceOverride, user?.fullName]);

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
    // Block checkout if any serialized items have incomplete serials
    if (incompleteSerials.length > 0) {
      const itemList = incompleteSerials
        .map(l => `\u2022 ${l.name} \u2014 ${l.serials.length}/${l.quantity} serials`)
        .join('\n');
      Alert.alert(
        'Serial Numbers Required',
        `Enter serial numbers for:\n\n${itemList}`,
        [{ text: 'OK' }],
      );
      return;
    }

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
              <Pressable onLongPress={() => handlePriceOverride(item)} hitSlop={4}>
                <Text style={styles.lineTotal}>{fmtPHP(item.lineTotal)}</Text>
              </Pressable>
            </View>
            <Text style={styles.lineName} numberOfLines={2}>{item.name}</Text>
            <View style={styles.lineMetaRow}>
              <Text style={styles.lineUnitPrice}>{fmtPHP(item.unitPrice)} × {item.quantity}</Text>
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
            {/* Serial number badge */}
            {item.isSerialized && (
              <Pressable
                onPress={() => setSerialModalLine(item)}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}
              >
                <View style={{
                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                  backgroundColor: item.serials.length >= item.quantity
                    ? 'rgba(52,199,89,0.15)' : 'rgba(255,59,48,0.15)',
                }}>
                  <Text style={{
                    fontSize: 10, fontFamily: 'Outfit-SemiBold',
                    color: item.serials.length >= item.quantity
                      ? colors.status.success : colors.status.danger,
                  }}>
                    Serial {item.serials.length}/{item.quantity}
                  </Text>
                </View>
                {/* Warranty photo button */}
                {item.serials.length >= item.quantity && (item.warrantyMonths ?? 0) > 0 && (
                  <WarrantyPhotoCapture
                    photoUri={item.warrantyPhotoUri}
                    onCapture={(uri) => setLineWarrantyPhoto(item.id, uri)}
                    onClear={() => setLineWarrantyPhoto(item.id, null)}
                  />
                )}
              </Pressable>
            )}
            {/* DOT batch allocation */}
            {item.isTire && item.dotAllocation && item.dotAllocation.length > 0 && (
              <View style={{ marginTop: 4 }}>
                {item.dotAllocation.map((alloc, i) => (
                  <Text key={i} style={{ fontSize: 10, color: colors.text.muted, fontFamily: 'JetBrainsMono-Regular' }}>
                    {formatDotAllocation(alloc)} ×{alloc.quantity}
                  </Text>
                ))}
                {can('overrideDotFIFO') && (
                  <Text style={{ fontSize: 10, color: colors.accent.primary, marginTop: 2 }}>Change DOT</Text>
                )}
              </View>
            )}
            {/* Price override display */}
            {item.overridePrice != null && (
              <View style={{ marginTop: 4, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: colors.status.warning, fontFamily: 'Outfit-Medium' }}>
                  Override: {fmtPHP(item.overridePrice)}
                </Text>
                {item.overrideApprovedBy && (
                  <Text style={{ fontSize: 9, color: colors.text.muted }}>
                    by {item.overrideApprovedBy}
                  </Text>
                )}
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
            <Text style={styles.cartHeaderCount}>{productCount} products · {unitCount} units</Text>
          </View>
        )}
        <View style={styles.headerActions}>
          {lines.length > 0 && (
            <Pressable
              onPress={handleHoldCart}
              hitSlop={8}
              style={styles.holdButton}
              android_ripple={{ color: colors.status.warningBg }}
            >
              <Text style={styles.holdIcon}>{'\u23F8'}</Text>
              <Text style={styles.holdText}>Hold</Text>
            </Pressable>
          )}
          {lines.length > 0 && (
            <Pressable
              onPress={() => {
                guard(
                  'voidSale',
                  `Void cart (${unitCount} items, ${fmtPHP(grandTotal)})`,
                  (approverName) => {
                    logElevation({
                      action: 'void_sale',
                      description: `Voided cart with ${unitCount} items totaling ${fmtPHP(grandTotal)}`,
                      approvedBy: approverName,
                      performedBy: user?.fullName ?? 'Unknown',
                    });
                    clear();
                  },
                );
              }}
              hitSlop={8}
              style={styles.clearButton}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>
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
            {heldCartCount > 0 && (
              <Pressable
                style={styles.heldCartBanner}
                onPress={() => setHeldCartsSheetVisible(true)}
                android_ripple={{ color: colors.status.warningBg }}
              >
                <Text style={styles.heldCartBannerText}>
                  You have {heldCartCount} held cart{heldCartCount !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.heldCartBannerAction}>View Held Carts</Text>
              </Pressable>
            )}
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
            <Text style={styles.checkoutButtonText}>CHECKOUT {fmtPHP(grandTotal)}</Text>
          </Pressable>
        </View>
      )}

      <CustomerLookup
        visible={customerLookupVisible}
        onClose={() => setCustomerLookupVisible(false)}
        onSelect={handleSelectCustomer}
      />

      {/* Serial number input modal */}
      {serialModalLine && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <SerialInput
            lineId={serialModalLine.id}
            productId={serialModalLine.productId}
            productName={serialModalLine.name}
            requiredCount={serialModalLine.quantity}
            serials={serialModalLine.serials}
            onUpdate={(serials) => setLineSerials(serialModalLine.id, serials)}
            onClose={() => setSerialModalLine(null)}
          />
        </View>
      )}

      <HeldCartsSheet
        visible={heldCartsSheetVisible}
        onClose={() => setHeldCartsSheetVisible(false)}
      />

      {/* Price override modal */}
      <Modal
        visible={priceOverrideTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setPriceOverrideTarget(null); setPriceOverrideValue(''); }}
      >
        <Pressable
          style={styles.priceOverrideOverlay}
          onPress={() => { setPriceOverrideTarget(null); setPriceOverrideValue(''); }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable style={styles.priceOverrideContainer} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.priceOverrideTitle}>Price Override</Text>
              {priceOverrideTarget && (
                <Text style={styles.priceOverrideProduct} numberOfLines={2}>
                  {priceOverrideTarget.name}
                </Text>
              )}
              <Text style={styles.priceOverrideOriginal}>
                Current: {fmtPHP(priceOverrideTarget?.overridePrice ?? priceOverrideTarget?.unitPrice ?? 0)}
              </Text>
              <TextInput
                style={styles.priceOverrideInput}
                value={priceOverrideValue}
                onChangeText={setPriceOverrideValue}
                keyboardType="decimal-pad"
                placeholder="New price"
                placeholderTextColor={colors.text.muted}
                autoFocus
                selectTextOnFocus
              />
              <View style={styles.priceOverrideActions}>
                <Pressable
                  style={styles.priceOverrideCancelBtn}
                  onPress={() => { setPriceOverrideTarget(null); setPriceOverrideValue(''); }}
                >
                  <Text style={styles.priceOverrideCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.priceOverrideConfirmBtn}
                  onPress={handlePriceOverrideSubmit}
                >
                  <Text style={styles.priceOverrideConfirmText}>Override</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Manager PIN elevation modal */}
      <ManagerPinModal {...elevationProps} />
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
    borderBottomColor: colors.border.subtle,
  },
  cartHeaderTitle: {
    fontSize: 18,
    fontFamily: 'Outfit-Bold',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  cartHeaderCount: {
    fontSize: 13,
    fontFamily: 'Outfit-Medium',
    color: colors.text.muted,
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
    color: colors.text.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Outfit-Bold',
    color: colors.text.primary,
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
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  holdButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.status.warningBg,
    gap: 4,
  },
  holdIcon: {
    fontSize: 14,
    color: colors.status.warning,
  },
  holdText: {
    fontSize: 13,
    fontFamily: 'Outfit-SemiBold',
    color: colors.status.warning,
  },
  heldCartBanner: {
    marginTop: 20,
    backgroundColor: colors.status.warningBg,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  heldCartBannerText: {
    fontSize: 13,
    fontFamily: 'Outfit-Medium',
    color: colors.status.warning,
    marginBottom: 4,
  },
  heldCartBannerAction: {
    fontSize: 14,
    fontFamily: 'Outfit-SemiBold',
    color: colors.status.warning,
    textDecorationLine: 'underline' as const,
  },

  // Customer bar
  customerSelected: {
    backgroundColor: colors.bg.surface,
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
    color: colors.text.muted,
    paddingHorizontal: spacing.sm,
  },
  addCustomerButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border.light,
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
    color: colors.text.muted,
  },
  customerName: {
    fontSize: 14,
    fontFamily: 'Outfit-Medium',
    color: colors.text.primary,
  },
  customerVehicle: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: colors.text.muted,
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
    borderBottomColor: colors.border.subtle,
  },
  cartLineSKU: {
    fontSize: 13,
    fontFamily: 'JetBrainsMono-Regular',
    color: '#9B978F',
    flex: 1,
  },
  lineName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginTop: 2,
  },
  lineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
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
    color: colors.text.muted,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    color: colors.text.inverse,
  },
  qtyText: {
    ...textStyles.monoLg,
    color: colors.text.primary,
    marginHorizontal: spacing.md,
    minWidth: 28,
    textAlign: 'center',
  },
  lineTotal: {
    ...textStyles.price,
    color: colors.text.primary,
    marginLeft: spacing.sm,
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
    color: colors.text.muted,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Cart Footer — PINNED
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
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
    color: colors.text.muted,
  },
  vatAmount: {
    fontSize: 12,
    fontFamily: 'Outfit-Medium',
    color: colors.text.muted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: colors.text.muted,
  },
  totalValue: {
    fontSize: 13,
    fontFamily: 'Outfit-Medium',
    color: colors.text.primary,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  grandTotalLabel: {
    ...textStyles.label,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  grandTotalValue: {
    ...textStyles.priceLarge,
    color: colors.accent.primary,
  },

  // Checkout button
  checkoutButton: {
    backgroundColor: colors.accent.primary,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  checkoutButtonText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    color: colors.text.inverse,
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

  // Price override modal
  priceOverrideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceOverrideContainer: {
    width: 320,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  priceOverrideTitle: {
    fontSize: fontSize.xl,
    fontFamily: 'Outfit-Bold',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  priceOverrideProduct: {
    fontSize: fontSize.base,
    fontFamily: 'Outfit-Medium',
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  priceOverrideOriginal: {
    fontSize: fontSize.sm,
    fontFamily: 'DMSans-Regular',
    color: colors.text.muted,
    marginBottom: spacing.lg,
  },
  priceOverrideInput: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize['2xl'],
    fontFamily: 'Outfit-SemiBold',
    color: colors.text.primary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    marginBottom: spacing.lg,
  },
  priceOverrideActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priceOverrideCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
  },
  priceOverrideCancelText: {
    fontSize: fontSize.base,
    fontFamily: 'Outfit-SemiBold',
    color: colors.text.muted,
  },
  priceOverrideConfirmBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
  },
  priceOverrideConfirmText: {
    fontSize: fontSize.base,
    fontFamily: 'Outfit-SemiBold',
    color: colors.text.inverse,
  },
});
