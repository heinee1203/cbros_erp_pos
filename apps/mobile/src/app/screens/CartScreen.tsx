import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { getHeldCartCount } from '@/storage/held-carts';
import type { Customer, Vehicle } from '@/hooks/use-customer-search';
import { useLayout } from '@/hooks/use-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { useRequireElevation } from '@/hooks/use-require-elevation';
import { getDiscountPermissionLevel, type PosPermission } from '@/config/pos-permissions';
import { logElevation } from '@/services/audit-logger';
import { buildCartCheckoutPreflight } from '@/utils/checkout-preflight';
import { formatDotAllocation } from '@/utils/dot-fifo-allocate';
import { colors, textStyles, spacing, radius, layout, fonts, fontSize, touchTarget } from '@/theme';
import type { PaymentIntent } from '@/app/MainTabs';
import { Icon } from '@/components/ui';

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CartScreenProps {
  onProceedToPayment?: (intent?: PaymentIntent) => void;
}

type DiscountMode = 'percentage' | 'fixed';

type DiscountTarget =
  | { type: 'line'; line: CartLine }
  | { type: 'cart' };

const MIN_PRICE_OVERRIDE_NOTE_LENGTH = 5;

function getLineGross(line: CartLine): number {
  return (line.overridePrice ?? line.unitPrice) * line.quantity;
}

function getLineDiscountAmount(line: CartLine): number {
  return Math.max(0, getLineGross(line) - line.lineTotal);
}

function permissionForLineDiscount(percentage: number): PosPermission {
  const level = getDiscountPermissionLevel(percentage);
  if (level <= 1) return 'applyLineDiscount5';
  if (level <= 2) return 'applyLineDiscount15';
  return 'applyLineDiscountAny';
}

function authorizationAuditMetadata(approval?: ManagerAuthorization): Record<string, string | undefined> {
  return {
    authorizationMethod: approval?.method ?? 'session',
    authorizationUserId: approval?.userId,
    authorizationRole: approval?.role,
  };
}

function authorizationMethodLabel(method?: string | null): string {
  if (method === 'pin') return 'PIN';
  if (method === 'barcode') return 'Barcode';
  if (method === 'card') return 'Card';
  return 'Session';
}

export default function CartScreen({ onProceedToPayment }: CartScreenProps) {
  const navigation = useNavigation<any>();
  const { isTablet, screenPadding } = useLayout();
  const { can } = usePosPermission();
  const { user } = useAuth();
  const { guard, elevationProps } = useRequireElevation();

  const lines = useCartStore(s => s.lines);
  const customerId = useCartStore(s => s.customerId);
  const customerName = useCartStore(s => s.customerName);
  const vehicleId = useCartStore(s => s.vehicleId);
  const allowNegativeStock = useCartStore(s => s.allowNegativeStock);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const removeLine = useCartStore(s => s.removeLine);
  const setAllowNegativeStock = useCartStore(s => s.setAllowNegativeStock);
  const clearWithRestoreSnapshot = useCartStore(s => s.clearWithRestoreSnapshot);
  const restoreLastClearedCart = useCartStore(s => s.restoreLastClearedCart);
  const setLineSerials = useCartStore(s => s.setLineSerials);
  const setLineWarrantyPhoto = useCartStore(s => s.setLineWarrantyPhoto);
  const setLinePriceOverride = useCartStore(s => s.setLinePriceOverride);
  const setLineDiscount = useCartStore(s => s.setLineDiscount);
  const setCartDiscount = useCartStore(s => s.setCartDiscount);
  const cartDiscountType = useCartStore(s => s.discountType);
  const cartDiscountValue = useCartStore(s => s.discountValue);
  const incompleteSerials = useCartStore(useShallow(selectIncompleteSerials));

  const subtotal = useCartStore(selectSubtotal);
  const discount = useCartStore(selectCartDiscount);
  const grandTotal = useCartStore(selectGrandTotal);
  const unitCount = useCartStore(selectLineCount);
  const productCount = lines.length;
  const lowStockLines = useMemo(
    () => lines.filter(l => l.availableStock !== null && l.availableStock < l.quantity),
    [lines],
  );

  // Serial input modal state
  const [serialModalLine, setSerialModalLine] = useState<CartLine | null>(null);

  // Price override modal state
  const [priceOverrideTarget, setPriceOverrideTarget] = useState<CartLine | null>(null);
  const [priceOverrideValue, setPriceOverrideValue] = useState('');
  const [priceOverrideNote, setPriceOverrideNote] = useState('');

  // Discount modal state
  const [discountTarget, setDiscountTarget] = useState<DiscountTarget | null>(null);
  const [discountMode, setDiscountMode] = useState<DiscountMode>('percentage');
  const [discountValueInput, setDiscountValueInput] = useState('');

  const attachCustomer = useCartStore(s => s.attachCustomer);
  const detachCustomer = useCartStore(s => s.detachCustomer);
  const note = useCartStore(s => s.note);
  const setNote = useCartStore(s => s.setNote);

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
    setPriceOverrideNote('');
  }, []);

  const handlePriceOverrideSubmit = useCallback(() => {
    if (!priceOverrideTarget) return;
    const newPrice = parseFloat(priceOverrideValue);
    if (isNaN(newPrice) || newPrice < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }
    const auditNote = priceOverrideNote.trim();
    if (auditNote.length < MIN_PRICE_OVERRIDE_NOTE_LENGTH) {
      Alert.alert('Audit Note Required', 'Add a short note before overriding this line price.');
      return;
    }
    const item = priceOverrideTarget;
    const oldPrice = item.overridePrice ?? item.unitPrice;
    setPriceOverrideTarget(null);
    setPriceOverrideValue('');
    setPriceOverrideNote('');
    guard(
      'priceOverride',
      `Override price on ${item.name}\n${fmtPHP(oldPrice)} \u2192 ${fmtPHP(newPrice)}`,
      (approverName, approval) => {
        setLinePriceOverride(item.id, newPrice, approverName, {
          authorizationMethod: approval?.method ?? 'session',
          note: auditNote,
        });
        logElevation({
          action: 'price_override',
          description: `Price override on ${item.name} ${fmtPHP(oldPrice)} \u2192 ${fmtPHP(newPrice)}`,
          approvedBy: approverName,
          performedBy: user?.fullName ?? 'Unknown',
          metadata: {
            lineId: item.id,
            productId: item.productId,
            oldPrice,
            newPrice,
            note: auditNote,
            capturedAt: new Date().toISOString(),
            ...authorizationAuditMetadata(approval),
          },
        });
      },
    );
  }, [priceOverrideNote, priceOverrideTarget, priceOverrideValue, guard, setLinePriceOverride, user?.fullName]);

  const closeDiscountModal = useCallback(() => {
    setDiscountTarget(null);
    setDiscountValueInput('');
    setDiscountMode('percentage');
  }, []);

  const handleLineDiscount = useCallback((line: CartLine) => {
    setDiscountTarget({ type: 'line', line });
    setDiscountMode(line.discountType === 'fixed' ? 'fixed' : 'percentage');
    setDiscountValueInput(line.discountType === 'none' ? '' : String(line.discountValue));
  }, []);

  const handleCartDiscount = useCallback(() => {
    setDiscountTarget({ type: 'cart' });
    setDiscountMode(cartDiscountType === 'fixed' ? 'fixed' : 'percentage');
    setDiscountValueInput(cartDiscountType === 'none' ? '' : String(cartDiscountValue));
  }, [cartDiscountType, cartDiscountValue]);

  const handleClearCartDiscount = useCallback(() => {
    setCartDiscount('none', 0);
  }, [setCartDiscount]);

  const handleDiscountSubmit = useCallback(() => {
    if (!discountTarget) return;

    const rawValue = parseFloat(discountValueInput.replace(/,/g, ''));
    if (Number.isNaN(rawValue) || rawValue < 0) {
      Alert.alert('Invalid Discount', 'Enter a valid discount amount.');
      return;
    }

    const baseAmount = discountTarget.type === 'line'
      ? getLineGross(discountTarget.line)
      : subtotal;
    if (baseAmount <= 0) {
      Alert.alert('Invalid Discount', 'There is no amount available to discount.');
      return;
    }

    if (rawValue === 0) {
      if (discountTarget.type === 'line') {
        setLineDiscount(discountTarget.line.id, 'none', 0);
      } else {
        setCartDiscount('none', 0);
      }
      closeDiscountModal();
      return;
    }

    if (discountMode === 'percentage' && rawValue > 100) {
      Alert.alert('Invalid Discount', 'Percentage discounts cannot exceed 100%.');
      return;
    }

    const discountAmount = discountMode === 'percentage'
      ? baseAmount * (rawValue / 100)
      : rawValue;
    if (discountAmount > baseAmount) {
      Alert.alert('Invalid Discount', 'Discount cannot exceed the eligible total.');
      return;
    }

    const effectivePercentage = baseAmount > 0 ? (discountAmount / baseAmount) * 100 : 0;
    const permission = discountTarget.type === 'cart'
      ? 'applyCartDiscount'
      : permissionForLineDiscount(effectivePercentage);
    const targetLabel = discountTarget.type === 'line'
      ? discountTarget.line.name
      : 'cart total';
    const displayValue = discountMode === 'percentage'
      ? `${rawValue}%`
      : fmtPHP(rawValue);

    closeDiscountModal();
    guard(
      permission,
      `Apply ${displayValue} discount to ${targetLabel}`,
      (approverName, approval) => {
        if (discountTarget.type === 'line') {
          setLineDiscount(discountTarget.line.id, discountMode, rawValue);
        } else {
          setCartDiscount(discountMode, rawValue);
        }

        logElevation({
          action: 'manual_discount',
          description: `Applied ${displayValue} discount to ${targetLabel}`,
          approvedBy: approverName,
          performedBy: user?.fullName ?? 'Unknown',
          metadata: {
            target: discountTarget.type,
            lineId: discountTarget.type === 'line' ? discountTarget.line.id : undefined,
            productId: discountTarget.type === 'line' ? discountTarget.line.productId : undefined,
            discountType: discountMode,
            discountValue: rawValue,
            discountAmount,
            ...authorizationAuditMetadata(approval),
          },
        });
      },
    );
  }, [
    closeDiscountModal,
    discountMode,
    discountTarget,
    discountValueInput,
    guard,
    setCartDiscount,
    setLineDiscount,
    subtotal,
    user?.fullName,
  ]);

  const handleSelectCustomer = useCallback((customer: Customer, vehicle?: Vehicle) => {
    attachCustomer(customer.id, customer.name, vehicle?.id);
  }, [attachCustomer]);

  const proceedToPayment = useCallback((intent: PaymentIntent = 'CASH') => {
    if (onProceedToPayment) {
      onProceedToPayment(intent);
    } else {
      navigation.navigate('Payment', { initialMethod: intent });
    }
  }, [onProceedToPayment, navigation]);

  const handleProceedToPayment = useCallback((intent: PaymentIntent = 'CASH') => {
    if (intent === 'CHARGE' && !customerId) {
      Alert.alert(
        'Customer Required',
        'Add a customer before charging the sale to an account.',
      );
      return;
    }

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
        'Manager Authorization Required',
        `The following items will go into negative inventory:\n\n${itemList}\n\nA manager must approve before checkout.`,
        [
          { text: 'Go Back', style: 'cancel' },
          {
            text: 'Authorize',
            style: 'destructive',
            onPress: () => {
              guard(
                'overrideNegativeStock',
                `Approve negative inventory checkout\n${itemList}`,
                (approverName, approval) => {
                  logElevation({
                    action: 'negative_stock_override',
                    description: `Negative inventory checkout approved by ${approverName}`,
                    approvedBy: approverName,
                    performedBy: user?.fullName ?? 'Unknown',
                    metadata: {
                      items: lowStockLines.map(l => ({
                        lineId: l.id,
                        productId: l.productId,
                        name: l.name,
                        quantity: l.quantity,
                        availableStock: l.availableStock,
                      })),
                      ...authorizationAuditMetadata(approval),
                    },
                  });
                  setAllowNegativeStock(true);
                  proceedToPayment(intent);
                },
              );
            },
          },
        ],
      );
      return;
    }

    setAllowNegativeStock(false);
    proceedToPayment(intent);
  }, [customerId, guard, incompleteSerials, lowStockLines, proceedToPayment, setAllowNegativeStock, user?.fullName]);

  const hasStockWarnings = lowStockLines.length > 0;
  const checkoutPreflight = buildCartCheckoutPreflight({
    lineCount: productCount,
    unitCount,
    customerId,
    incompleteSerialCount: incompleteSerials.length,
    stockWarningCount: lowStockLines.length,
    hasNegativeStockApproval: allowNegativeStock,
  });
  const checkoutPrepColor = checkoutPreflight.ready
    ? colors.status.success
    : checkoutPreflight.blockingIssues.length > 0
      ? colors.status.danger
      : colors.status.warning;

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

  const handlePlusPress = useCallback((item: CartLine) => {
    if (item.availableStock !== null && item.quantity >= item.availableStock) {
      Alert.alert(
        'Insufficient Stock',
        item.availableStock <= 0
          ? `${item.name} has no stock at this branch.`
          : `${item.name} has only ${item.availableStock} available.`,
      );
      return;
    }

    const nextQty = item.quantity + 1;
    if (nextQty > 25) {
      Alert.alert(
        'Large Quantity',
        `${item.name} will be set to ${nextQty}. Confirm the scan/count is intentional.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => updateQuantity(item.id, nextQty) },
        ],
      );
      return;
    }

    updateQuantity(item.id, nextQty);
  }, [updateQuantity]);

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
    const lineDiscountAmount = getLineDiscountAmount(item);
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
              <Text style={styles.lineUnitPrice}>{fmtPHP(item.unitPrice)} x {item.quantity}</Text>
              {item.availableStock !== null && (
                <Text style={styles.lineStockMeta}>{item.availableStock} available</Text>
              )}
            </View>
            <View style={styles.lineActionRow}>
              <Pressable
                style={styles.lineActionButton}
                onPress={() => handleLineDiscount(item)}
                hitSlop={6}
              >
                <Icon name="tag" size={13} color={colors.accent.primary} />
                <Text style={styles.lineActionText}>
                  {lineDiscountAmount > 0 ? `-${fmtPHP(lineDiscountAmount)}` : 'Discount'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.lineActionButton}
                onPress={() => handlePriceOverride(item)}
                hitSlop={6}
              >
                <Icon name="cash" size={13} color={colors.accent.primary} />
                <Text style={styles.lineActionText}>Price</Text>
              </Pressable>
              <Pressable
                style={[styles.lineActionButton, styles.lineRemoveAction]}
                onPress={() => removeLine(item.id)}
                hitSlop={6}
              >
                <Icon name="trash" size={13} color={colors.status.danger} />
                <Text style={styles.lineRemoveActionText}>Remove</Text>
              </Pressable>
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
                    {formatDotAllocation(alloc)} x{alloc.quantity}
                  </Text>
                ))}
                {can('overrideDotFIFO') && (
                  <Text style={{ fontSize: 10, color: colors.accent.primary, marginTop: 2 }}>Change DOT</Text>
                )}
              </View>
            )}
            {/* Price override display */}
            {item.overridePrice != null && (
              <View style={{ marginTop: 4, flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 10, color: colors.status.warning, fontFamily: 'Outfit-Medium' }}>
                  Override: {fmtPHP(item.overridePrice)}
                </Text>
                <View style={styles.authorizationBadge}>
                  <Text style={styles.authorizationBadgeText}>
                    {authorizationMethodLabel(item.overrideAuthorizationMethod)}
                  </Text>
                </View>
                {item.overrideApprovedBy && (
                  <Text style={{ fontSize: 9, color: colors.text.muted }}>
                    by {item.overrideApprovedBy}
                  </Text>
                )}
              </View>
            )}
            {lineDiscountAmount > 0 && (
              <Text style={styles.discountNote}>
                Discount applied: {item.discountType === 'percentage' ? `${item.discountValue}%` : fmtPHP(item.discountValue)}
              </Text>
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
              onPress={() => handlePlusPress(item)}
              hitSlop={8}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
      </Swipeable>
    );
  };

  const discountTargetLabel = discountTarget?.type === 'line'
    ? discountTarget.line.name
    : 'Cart total';
  const discountEligibleAmount = discountTarget?.type === 'line'
    ? getLineGross(discountTarget.line)
    : subtotal;

  return (
    <SafeAreaView
      style={styles.container}
      testID="pos-cart-screen"
      accessibilityLabel="POS cart screen"
    >
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
          {heldCartCount > 0 && (
            <Pressable
              onPress={() => setHeldCartsSheetVisible(true)}
              hitSlop={8}
              style={styles.heldHeaderButton}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Icon name="hold" size={15} color={colors.accent.primary} />
              <Text style={styles.heldHeaderText}>{heldCartCount}</Text>
            </Pressable>
          )}
          {lines.length > 0 && (
            <Pressable
              onPress={handleHoldCart}
              hitSlop={8}
              style={styles.holdButton}
              android_ripple={{ color: colors.status.warningBg }}
            >
              <Icon name="hold" size={16} color={colors.status.warning} />
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
                    Alert.alert(
                      'Clear Cart?',
                      `This removes ${unitCount} item${unitCount === 1 ? '' : 's'} totaling ${fmtPHP(grandTotal)}. You can restore once if this was accidental.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Clear Cart',
                          style: 'destructive',
                          onPress: () => {
                            logElevation({
                              action: 'void_sale',
                              description: `Voided cart with ${unitCount} items totaling ${fmtPHP(grandTotal)}`,
                              approvedBy: approverName,
                              performedBy: user?.fullName ?? 'Unknown',
                            });
                            clearWithRestoreSnapshot();
                            Alert.alert(
                              'Cart Cleared',
                              'The cart was cleared and can be restored once.',
                              [
                                { text: 'Dismiss', style: 'cancel' },
                                {
                                  text: 'Restore Cart',
                                  onPress: () => {
                                    const restored = restoreLastClearedCart();
                                    if (!restored) {
                                      Alert.alert('Restore Unavailable', 'No cleared cart snapshot is available.');
                                    }
                                  },
                                },
                              ],
                            );
                          },
                        },
                      ],
                    );
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
        ListFooterComponent={lines.length > 0 ? (
          <View style={styles.checkoutPrepPanel}>
            <View style={styles.checkoutPrepHeader}>
              <View style={styles.checkoutPrepTitleRow}>
                <Icon
                  name={checkoutPreflight.ready ? 'check' : 'alert'}
                  size={17}
                  color={checkoutPrepColor}
                />
                <Text style={styles.checkoutPrepTitle}>
                  {checkoutPreflight.title}
                </Text>
              </View>
              <Text style={styles.checkoutPrepMeta}>
                {productCount} product{productCount === 1 ? '' : 's'} / {unitCount} unit{unitCount === 1 ? '' : 's'}
              </Text>
            </View>
            {checkoutPreflight.issues.length > 0 ? (
              <View style={styles.checkoutIssueList}>
                {checkoutPreflight.issues.map(issue => (
                  <View key={issue.code} style={styles.checkoutIssueRow}>
                    <View style={[
                      styles.checkoutIssueDot,
                      issue.severity === 'blocking'
                        ? styles.checkoutIssueDotDanger
                        : styles.checkoutIssueDotWarning,
                    ]} />
                    <View style={styles.checkoutIssueCopy}>
                      <Text style={styles.checkoutIssueLabel}>{issue.label}</Text>
                      <Text style={styles.checkoutIssueDetail}>{issue.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.checkoutPrepIssues}>{checkoutPreflight.detail}</Text>
            )}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Sale note, install detail, or pickup instruction"
              placeholderTextColor={colors.text.muted}
              style={styles.saleNoteInput}
              multiline
              returnKeyType="done"
            />
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="cart" size={34} color={colors.text.muted} />
            </View>
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
          lines.length > 0 ? styles.cartListContent : undefined,
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

          <View style={styles.discountControlRow}>
            <Pressable
              style={styles.cartDiscountButton}
              onPress={handleCartDiscount}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Icon name="tag" size={15} color={colors.accent.primary} />
              <Text style={styles.cartDiscountButtonText}>
                {discount > 0 ? 'Edit Cart Discount' : 'Add Cart Discount'}
              </Text>
            </Pressable>
            {discount > 0 && (
              <Pressable
                style={styles.cartDiscountClear}
                onPress={handleClearCartDiscount}
                hitSlop={8}
              >
                <Icon name="close" size={15} color={colors.status.danger} />
              </Pressable>
            )}
          </View>

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

          {/* Payment action buttons — matches Base44 layout */}
          <Pressable
            style={styles.cashButton}
            onPress={() => handleProceedToPayment('CASH')}
            android_ripple={{ color: 'rgba(0,0,0,0.2)' }}
          >
            <Icon name="cash" size={20} color={colors.white} />
            <Text style={styles.cashButtonText}>Cash</Text>
          </Pressable>
          <Pressable
            style={styles.chargeButton}
            onPress={() => handleProceedToPayment('CHARGE')}
            android_ripple={{ color: 'rgba(22,163,74,0.15)' }}
          >
            <Icon name="receipt" size={18} color={colors.status.success} />
            <Text style={styles.chargeButtonText}>Charge to Account</Text>
          </Pressable>
          <Pressable
            style={styles.splitButton}
            onPress={() => handleProceedToPayment('SPLIT')}
            android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
          >
            <Icon name="card" size={18} color={colors.text.secondary} />
            <Text style={styles.splitButtonText}>Split Payment</Text>
          </Pressable>
          <Pressable
            style={styles.holdParkButton}
            onPress={handleHoldCart}
            android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
          >
            <Icon name="hold" size={15} color={colors.text.muted} />
            <Text style={styles.holdParkButtonText}>Hold / Park</Text>
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
        onRequestClose={() => { setPriceOverrideTarget(null); setPriceOverrideValue(''); setPriceOverrideNote(''); }}
      >
        <Pressable
          style={styles.priceOverrideOverlay}
          onPress={() => { setPriceOverrideTarget(null); setPriceOverrideValue(''); setPriceOverrideNote(''); }}
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
                  onPress={() => { setPriceOverrideTarget(null); setPriceOverrideValue(''); setPriceOverrideNote(''); }}
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

      {/* Discount modal */}
      <Modal
        visible={discountTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeDiscountModal}
      >
        <Pressable style={styles.priceOverrideOverlay} onPress={closeDiscountModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.priceOverrideContainer} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.priceOverrideTitle}>Discount</Text>
              <Text style={styles.priceOverrideProduct} numberOfLines={2}>
                {discountTargetLabel}
              </Text>
              <Text style={styles.priceOverrideOriginal}>
                Eligible total: {fmtPHP(discountEligibleAmount)}
              </Text>

              <View style={styles.discountModeToggle}>
                <Pressable
                  style={[styles.discountModeButton, discountMode === 'percentage' && styles.discountModeButtonActive]}
                  onPress={() => setDiscountMode('percentage')}
                >
                  <Text style={[styles.discountModeText, discountMode === 'percentage' && styles.discountModeTextActive]}>%</Text>
                </Pressable>
                <Pressable
                  style={[styles.discountModeButton, discountMode === 'fixed' && styles.discountModeButtonActive]}
                  onPress={() => setDiscountMode('fixed')}
                >
                  <Text style={[styles.discountModeText, discountMode === 'fixed' && styles.discountModeTextActive]}>PHP</Text>
                </Pressable>
              </View>

              <TextInput
                style={styles.priceOverrideInput}
                value={discountValueInput}
                onChangeText={setDiscountValueInput}
                keyboardType="decimal-pad"
                placeholder={discountMode === 'percentage' ? 'Percent' : 'Amount'}
                placeholderTextColor={colors.text.muted}
                autoFocus
                selectTextOnFocus
              />
              <TextInput
                style={[styles.priceOverrideInput, styles.priceOverrideNoteInput]}
                value={priceOverrideNote}
                onChangeText={setPriceOverrideNote}
                placeholder="Required audit note"
                placeholderTextColor={colors.text.muted}
                multiline
              />
              <Text style={[
                styles.priceOverrideAuditHint,
                priceOverrideNote.trim().length >= MIN_PRICE_OVERRIDE_NOTE_LENGTH && styles.priceOverrideAuditHintReady,
              ]}>
                {priceOverrideNote.trim().length >= MIN_PRICE_OVERRIDE_NOTE_LENGTH
                  ? 'Audit note ready.'
                  : `Add at least ${MIN_PRICE_OVERRIDE_NOTE_LENGTH} characters for manager review.`}
              </Text>
              <View style={styles.priceOverrideActions}>
                <Pressable style={styles.priceOverrideCancelBtn} onPress={closeDiscountModal}>
                  <Text style={styles.priceOverrideCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.discountClearBtn} onPress={() => setDiscountValueInput('0')}>
                  <Text style={styles.priceOverrideCancelText}>Clear</Text>
                </Pressable>
                <Pressable style={styles.priceOverrideConfirmBtn} onPress={handleDiscountSubmit}>
                  <Text style={styles.priceOverrideConfirmText}>Apply</Text>
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
  cartListContent: {
    paddingBottom: spacing.sm,
  },

  // Cart Header
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    backgroundColor: colors.bg.surface,
  },
  cartHeaderTitle: {
    fontSize: 18,
    fontFamily: 'Outfit-Bold',
    color: colors.text.primary,
    letterSpacing: 0,
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
    letterSpacing: 0,
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.status.dangerBg,
    borderWidth: 1,
    borderColor: colors.status.danger,
  },
  clearText: {
    fontSize: 13,
    fontFamily: 'Outfit-SemiBold',
    color: colors.status.danger,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  heldHeaderButton: {
    minWidth: 42,
    minHeight: 36,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: colors.accent.muted,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    paddingHorizontal: spacing.sm,
  },
  heldHeaderText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.display.bold,
    color: colors.accent.primary,
  },
  holdButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.status.warningBg,
    borderWidth: 1,
    borderColor: colors.status.warning,
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
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.subtle,
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
    borderColor: colors.border.medium,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 12,
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
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
  checkoutPrepPanel: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  checkoutPrepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  checkoutPrepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  checkoutPrepTitle: {
    fontSize: fontSize.base,
    fontFamily: fonts.display.semiBold,
    color: colors.text.primary,
  },
  checkoutPrepMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.medium,
    color: colors.text.muted,
  },
  checkoutPrepIssues: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body.medium,
    color: colors.text.secondary,
  },
  checkoutIssueList: {
    gap: spacing.xs,
  },
  checkoutIssueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  checkoutIssueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  checkoutIssueDotDanger: {
    backgroundColor: colors.status.danger,
  },
  checkoutIssueDotWarning: {
    backgroundColor: colors.status.warning,
  },
  checkoutIssueCopy: {
    flex: 1,
  },
  checkoutIssueLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body.semiBold,
    color: colors.text.primary,
  },
  checkoutIssueDetail: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.medium,
    color: colors.text.muted,
    marginTop: 1,
  },
  saleNoteInput: {
    minHeight: 42,
    maxHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.base,
    textAlignVertical: 'top',
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
    backgroundColor: colors.bg.surface,
  },
  cartLineSKU: {
    fontSize: 13,
    fontFamily: 'JetBrainsMono-Regular',
    color: '#94A3B8',
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
    letterSpacing: 0,
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
  lineStockMeta: {
    fontSize: 12,
    fontFamily: fonts.body.medium,
    color: colors.text.muted,
  },
  lineActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 6,
  },
  lineActionButton: {
    minHeight: 30,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  lineActionText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.semiBold,
    color: colors.accent.primary,
  },
  lineRemoveAction: {
    backgroundColor: colors.status.dangerBg,
    borderColor: colors.status.danger,
  },
  lineRemoveActionText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.semiBold,
    color: colors.status.danger,
  },
  lineDiscountButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    minHeight: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.sm,
  },
  lineDiscountButtonText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.semiBold,
    color: colors.accent.primary,
  },
  discountNote: {
    marginTop: 4,
    fontSize: fontSize.xs,
    fontFamily: fonts.body.medium,
    color: colors.status.danger,
  },
  authorizationBadge: {
    minHeight: 18,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  authorizationBadgeText: {
    fontSize: 9,
    fontFamily: fonts.body.semiBold,
    color: colors.accent.primary,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
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
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
    paddingVertical: 12,
    backgroundColor: colors.bg.surface,
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
  discountControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cartDiscountButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cartDiscountButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body.semiBold,
    color: colors.accent.primary,
  },
  cartDiscountClear: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.status.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  grandTotalLabel: {
    ...textStyles.label,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  grandTotalValue: {
    ...textStyles.priceLarge,
    color: colors.accent.primary,
  },

  // Payment action buttons — Base44 style (Cash=green filled, Charge=green outlined, Split=neutral outlined, Hold=text)
  cashButton: {
    backgroundColor: colors.status.success,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  cashButtonText: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.lg,
    color: '#FFFFFF',
    letterSpacing: 0,
  },
  chargeButton: {
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.status.warning,
    backgroundColor: colors.status.warningBg,
    marginBottom: 8,
  },
  chargeButtonText: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
    color: colors.status.warning,
  },
  splitButton: {
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border.medium,
    backgroundColor: colors.bg.surface,
    marginBottom: 8,
  },
  splitButtonText: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  holdParkButton: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  holdParkButtonText: {
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    color: colors.text.muted,
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
  priceOverrideNoteInput: {
    minHeight: 72,
    textAlign: 'left',
    textAlignVertical: 'top',
    fontSize: fontSize.base,
    fontFamily: fonts.body.medium,
    marginBottom: spacing.xs,
  },
  priceOverrideAuditHint: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.medium,
    color: colors.text.muted,
    marginBottom: spacing.lg,
  },
  priceOverrideAuditHintReady: {
    color: colors.status.success,
  },
  priceOverrideActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  discountModeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.sm,
    padding: 4,
    gap: 4,
    marginBottom: spacing.md,
  },
  discountModeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountModeButtonActive: {
    backgroundColor: colors.accent.primary,
  },
  discountModeText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body.semiBold,
    color: colors.text.secondary,
  },
  discountModeTextActive: {
    color: colors.text.inverse,
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
  discountClearBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
  },
  priceOverrideConfirmText: {
    fontSize: fontSize.base,
    fontFamily: 'Outfit-SemiBold',
    color: colors.text.inverse,
  },
});
