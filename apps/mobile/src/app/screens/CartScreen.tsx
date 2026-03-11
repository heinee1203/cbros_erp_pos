import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  useCartStore,
  selectSubtotal,
  selectCartDiscount,
  selectGrandTotal,
  selectChange,
  selectLineCount,
  type CartLine,
} from '@/stores/cart-store';
import { useCheckout } from '@/hooks/use-checkout';
import { usePrinter } from '@/hardware/printer/context';
import type { ReceiptData } from '@/hardware/printer/types';
import { useAuth } from '@/hooks/use-auth';
import { CustomerLookup } from '@/components/CustomerLookup';
import type { Customer, Vehicle } from '@/hooks/use-customer-search';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, radius, layout, fonts, fontSize } from '@/theme';
import { Button, Card, Chip } from '@/components/ui';

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAYMENT_METHODS = [
  { key: 'CASH' as const, label: 'Cash' },
  { key: 'CARD' as const, label: 'Card' },
  { key: 'QRPH' as const, label: 'QRPH' },
  { key: 'GCASH' as const, label: 'GCash' },
  { key: 'MAYA' as const, label: 'Maya' },
];

export default function CartScreen() {
  const navigation = useNavigation();
  const { isTablet, screenPadding } = useLayout();
  const { user, locations, locationId } = useAuth();
  const printer = usePrinter();

  const lines = useCartStore(s => s.lines);
  const paymentMethod = useCartStore(s => s.paymentMethod);
  const cashTendered = useCartStore(s => s.cashTendered);
  const customerId = useCartStore(s => s.customerId);
  const customerName = useCartStore(s => s.customerName);
  const vehicleId = useCartStore(s => s.vehicleId);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const removeLine = useCartStore(s => s.removeLine);
  const setPaymentMethod = useCartStore(s => s.setPaymentMethod);
  const setCashTendered = useCartStore(s => s.setCashTendered);
  const clear = useCartStore(s => s.clear);

  const subtotal = useCartStore(selectSubtotal);
  const discount = useCartStore(selectCartDiscount);
  const grandTotal = useCartStore(selectGrandTotal);
  const change = useCartStore(selectChange);
  const lineCount = useCartStore(selectLineCount);

  const attachCustomer = useCartStore(s => s.attachCustomer);
  const detachCustomer = useCartStore(s => s.detachCustomer);

  const [customerLookupVisible, setCustomerLookupVisible] = useState(false);

  const handleSelectCustomer = useCallback((customer: Customer, vehicle?: Vehicle) => {
    attachCustomer(customer.id, customer.name, vehicle?.id);
  }, [attachCustomer]);

  const { status, error, result, checkout, reset } = useCheckout();

  const handleCheckout = useCallback(async () => {
    const res = await checkout();
    if (res) {
      // Print receipt (non-blocking — failure doesn't affect sale)
      const location = locations.find(l => l.id === locationId);
      const receiptData: ReceiptData = {
        header: {
          storeName: location?.name || 'APEX AUTO PARTS',
          address: location?.address || undefined,
        },
        transaction: {
          receiptNumber: res.saleNo,
          date: new Date().toLocaleString(),
          cashier: user?.fullName || 'Cashier',
          lines: lines.map(l => ({
            name: l.name,
            qty: l.quantity,
            unitPrice: l.unitPrice,
            total: l.lineTotal,
          })),
          subtotal,
          discount,
          grandTotal,
          paymentMethod,
          cashTendered: paymentMethod === 'CASH' ? cashTendered : undefined,
          change: paymentMethod === 'CASH' ? change : undefined,
        },
        footer: { message: 'Thank you for your purchase!' },
      };

      printer.printReceipt(receiptData).catch(() => {
        // Print failure is non-blocking
        Alert.alert('Print Notice', 'Receipt could not be printed. You can reprint from Transactions.');
      });
    }
  }, [checkout, lines, subtotal, discount, grandTotal, paymentMethod, cashTendered, change, printer, user, locations, locationId]);

  const handleNewSale = useCallback(() => {
    clear();
    reset();
    if (!isTablet) navigation.goBack();
  }, [clear, reset, navigation, isTablet]);

  const handlePrintReceipt = useCallback(() => {
    if (!result) return;
    const location = locations.find(l => l.id === locationId);
    const receiptData: ReceiptData = {
      header: {
        storeName: location?.name || 'APEX AUTO PARTS',
        address: location?.address || undefined,
      },
      transaction: {
        receiptNumber: result.saleNo,
        date: new Date().toLocaleString(),
        cashier: user?.fullName || 'Cashier',
        lines: lines.map(l => ({
          name: l.name,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          total: l.lineTotal,
        })),
        subtotal,
        discount,
        grandTotal,
        paymentMethod,
        cashTendered: paymentMethod === 'CASH' ? cashTendered : undefined,
        change: paymentMethod === 'CASH' ? change : undefined,
      },
      footer: { message: 'Thank you for your purchase!' },
    };

    printer.printReceipt(receiptData).catch(() => {
      Alert.alert('Print Notice', 'Receipt could not be printed.');
    });
  }, [result, lines, subtotal, discount, grandTotal, paymentMethod, cashTendered, change, printer, user, locations, locationId]);

  // ── Success state ──
  if (status === 'success' && result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>{'\u2713'}</Text>
          <Text style={styles.successTitle}>Sale Complete</Text>
          <Text style={styles.successReceipt}>{result.saleNo}</Text>
          <Text style={styles.successTotal}>{fmtPHP(parseFloat(result.grandTotal))}</Text>
          <View style={styles.successActions}>
            <Button
              title="Print Receipt"
              variant="secondary"
              fullWidth
              onPress={handlePrintReceipt}
              style={styles.successButton}
            />
            <Button
              title="New Sale"
              variant="primary"
              fullWidth
              onPress={handleNewSale}
              style={styles.successButton}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Pending offline state ──
  if (status === 'pending_offline') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.pendingIcon}>{'\u23F3'}</Text>
          <Text style={styles.pendingTitle}>Sale Pending</Text>
          <Text style={styles.pendingText}>
            Sale saved locally. It will be completed when the device is back online.
          </Text>
          <Button
            title="New Sale"
            variant="primary"
            fullWidth
            onPress={handleNewSale}
            style={styles.successButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const renderLine = ({ item }: { item: CartLine }) => (
    <Card style={styles.lineCard} padded={false}>
      <View style={styles.lineContent}>
        <View style={styles.lineInfo}>
          <Text style={styles.lineName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.lineSku}>{item.mnemonicSku}</Text>
        </View>
        <View style={styles.qtyControls}>
          <Pressable
            style={styles.qtyBtn}
            onPress={() => updateQuantity(item.id, item.quantity - 1)}
          >
            <Text style={styles.qtyBtnText}>{'\u2212'}</Text>
          </Pressable>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <Pressable
            style={styles.qtyBtn}
            onPress={() => updateQuantity(item.id, item.quantity + 1)}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.lineTotal}>{fmtPHP(item.lineTotal)}</Text>
      </View>
    </Card>
  );

  const isProcessing = status === 'creating' || status === 'completing';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header — tablet: no Back button (persistent panel) */}
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        {!isTablet ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
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

      {/* Footer — totals + checkout */}
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

          {/* Payment method chips */}
          <View style={styles.paymentRow}>
            {PAYMENT_METHODS.map(pm => (
              <Chip
                key={pm.key}
                label={pm.label}
                active={paymentMethod === pm.key}
                onPress={() => setPaymentMethod(pm.key)}
                style={styles.paymentChip}
              />
            ))}
          </View>

          {/* Cash tendered (only for cash) */}
          {paymentMethod === 'CASH' && (
            <View style={styles.cashRow}>
              <TextInput
                style={styles.cashInput}
                placeholder="Cash tendered"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
                value={cashTendered > 0 ? String(cashTendered) : ''}
                onChangeText={v => setCashTendered(parseFloat(v) || 0)}
              />
              {cashTendered >= grandTotal && (
                <Text style={styles.changeText}>Change: {fmtPHP(change)}</Text>
              )}
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Charge button */}
          <Button
            title={isProcessing ? 'Processing...' : `Charge ${fmtPHP(grandTotal)}`}
            variant="primary"
            fullWidth
            onPress={handleCheckout}
            disabled={isProcessing || (paymentMethod === 'CASH' && cashTendered < grandTotal)}
            loading={isProcessing}
            style={styles.chargeButton}
            textStyle={styles.chargeButtonText}
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
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
  lineSku: {
    ...textStyles.monoSm,
    color: colors.text.muted,
    marginTop: spacing.xs,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
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

  // ── Payment chips ──
  paymentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
  paymentChip: {
    minWidth: 56,
  },

  // ── Cash tendered ──
  cashRow: {
    marginTop: spacing.sm,
  },
  cashInput: {
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  changeText: {
    ...textStyles.bodyMedium,
    color: colors.status.success,
    marginTop: spacing.xs,
  },

  // ── Error ──
  errorText: {
    ...textStyles.caption,
    color: colors.status.danger,
    marginTop: spacing.sm,
  },

  // ── Charge button ──
  chargeButton: {
    marginTop: spacing.md,
    minHeight: 56,
  },
  chargeButtonText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
  },

  // ── Success state ──
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['3xl'],
    backgroundColor: colors.bg.primary,
  },
  successIcon: {
    fontSize: 72,
    color: colors.status.success,
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  successReceipt: {
    ...textStyles.monoMd,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  successTotal: {
    ...textStyles.monoLg,
    color: colors.accent.primary,
    fontSize: fontSize['6xl'],
    marginBottom: spacing['3xl'],
  },
  successActions: {
    width: '100%',
    gap: spacing.sm,
  },
  successButton: {
    marginBottom: 0,
  },

  // ── Pending offline state ──
  pendingIcon: {
    fontSize: 72,
    color: colors.accent.primary,
    marginBottom: spacing.lg,
  },
  pendingTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  pendingText: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing['3xl'],
  },
});
