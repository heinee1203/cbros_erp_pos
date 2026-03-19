import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  useCartStore,
  selectSubtotal,
  selectCartDiscount,
  selectGrandTotal,
  selectPaidTotal,
  selectRemainingBalance,
  selectLineCount,
  type PaymentEntry,
} from '@/stores/cart-store';
import { useCheckout } from '@/hooks/use-checkout';
import { apiFetch } from '@/services/api-client';
import { getPendingSales } from '@/storage/pending-sales';
import { usePrinter } from '@/hardware/printer/context';
import type { ReceiptData } from '@/hardware/printer/types';
import { useAuth } from '@/hooks/use-auth';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, radius, fonts, fontSize, touchTarget } from '@/theme';
import { Button, Card } from '@/components/ui';

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAYMENT_METHODS = [
  { key: 'CASH', label: 'Cash', needsRef: false },
  { key: 'CREDIT_CARD', label: 'Credit Card', needsRef: true },
  { key: 'DEBIT_CARD', label: 'Debit Card', needsRef: true },
  { key: 'QRPH', label: 'QRPH', needsRef: true },
  { key: 'GCASH', label: 'GCash', needsRef: true },
  { key: 'MAYA', label: 'Maya', needsRef: true },
  { key: 'BANK_TRANSFER', label: 'Bank Transfer', needsRef: true },
  { key: 'CHARGE', label: 'Charge', needsRef: false },
];

const INSTALLMENT_TERMS = [
  { key: 'STRAIGHT', label: 'Straight' },
  { key: '3_MONTHS', label: '3 Months' },
  { key: '6_MONTHS', label: '6 Months' },
  { key: '12_MONTHS', label: '12 Months' },
];

const METHODS_NEEDING_REF = new Set(
  PAYMENT_METHODS.filter(m => m.needsRef).map(m => m.key),
);

function methodLabel(key: string): string {
  return PAYMENT_METHODS.find(m => m.key === key)?.label || key;
}

function installmentLabel(key: string): string {
  return INSTALLMENT_TERMS.find(t => t.key === key)?.label || key;
}

interface PaymentScreenProps {
  onBack?: () => void;
}

export default function PaymentScreen({ onBack }: PaymentScreenProps) {
  const navigation = useNavigation();
  const { isTablet, screenPadding } = useLayout();
  const { user, locations, locationId } = useAuth();
  const printer = usePrinter();

  // Cart store
  const lines = useCartStore(s => s.lines);
  const payments = useCartStore(s => s.payments);
  const receiptNumber = useCartStore(s => s.receiptNumber);
  const setReceiptNumber = useCartStore(s => s.setReceiptNumber);
  const addPayment = useCartStore(s => s.addPayment);
  const removePayment = useCartStore(s => s.removePayment);
  const clearPayments = useCartStore(s => s.clearPayments);
  const clear = useCartStore(s => s.clear);

  const allowNegativeStock = useCartStore(s => s.allowNegativeStock);
  const subtotal = useCartStore(selectSubtotal);
  const discount = useCartStore(selectCartDiscount);
  const grandTotal = useCartStore(selectGrandTotal);
  const paidTotal = useCartStore(selectPaidTotal);
  const remaining = useCartStore(selectRemainingBalance);
  const lineCount = useCartStore(selectLineCount);

  const { status, error, result, checkout, reset } = useCheckout();
  const isProcessing = status === 'creating' || status === 'completing';

  // ── Fetch next receipt number from server on mount ──
  const [receiptLoading, setReceiptLoading] = useState(true);

  const fetchNextReceiptNumber = useCallback(async () => {
    try {
      const data = await apiFetch<{ receiptNumber: string }>('/sales/next-receipt-number');
      setReceiptNumber(data.receiptNumber);
    } catch {
      // Offline — generate local receipt number
      setReceiptNumber(`OFFLINE-${Date.now()}`);
    } finally {
      setReceiptLoading(false);
    }
  }, [setReceiptNumber]);

  useEffect(() => {
    fetchNextReceiptNumber();
  }, [fetchNextReceiptNumber]);

  // ── Form state for composing a new payment entry ──
  const [formMethod, setFormMethod] = useState('CASH');
  const [formAmount, setFormAmount] = useState('');
  const [formCashTendered, setFormCashTendered] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formInstallment, setFormInstallment] = useState('STRAIGHT');

  const isFullyPaid = remaining <= 0 && payments.length > 0;
  const needsRef = METHODS_NEEDING_REF.has(formMethod);
  const isCash = formMethod === 'CASH';

  // Pre-fill amount with remaining balance (used for non-cash methods)
  const defaultAmount = useMemo(() => {
    return remaining > 0 ? remaining.toFixed(2) : '';
  }, [remaining]);

  const parsedCashTendered = parseFloat(formCashTendered) || 0;

  // For CASH: payment amount = min(tendered, remaining). Cashier only enters tendered.
  // For non-cash: payment amount = explicit amount field (or remaining balance).
  const parsedAmount = isCash
    ? Math.min(parsedCashTendered, remaining > 0 ? remaining : parsedCashTendered)
    : parseFloat(formAmount || defaultAmount) || 0;

  // Cash change: only when tendered covers more than remaining balance
  const cashChange = isCash && parsedCashTendered > remaining && remaining > 0
    ? parsedCashTendered - remaining
    : 0;

  const resetForm = useCallback(() => {
    setFormMethod('CASH');
    setFormAmount('');
    setFormCashTendered('');
    setFormReference('');
    setFormInstallment('STRAIGHT');
  }, []);

  const receiptMissing = !receiptNumber.trim();

  const handleAddPayment = useCallback(() => {
    if (receiptMissing) {
      Alert.alert('Receipt Required', 'Please enter the receipt number.');
      return;
    }
    if (isCash) {
      if (parsedCashTendered <= 0) {
        Alert.alert('Enter Cash', 'Please enter the cash amount tendered by the customer.');
        return;
      }
    } else {
      if (parsedAmount <= 0) {
        Alert.alert('Invalid Amount', 'Please enter a valid payment amount.');
        return;
      }
    }
    if (needsRef && !formReference.trim()) {
      Alert.alert('Reference Required', 'Please enter a reference / approval number.');
      return;
    }
    if (formMethod === 'CREDIT_CARD' && !formInstallment) {
      Alert.alert('Installment Required', 'Please select an installment term.');
      return;
    }

    addPayment({
      method: formMethod,
      amount: parsedAmount,
      reference: formReference.trim(),
      installmentTerm: formMethod === 'CREDIT_CARD' ? formInstallment : 'STRAIGHT',
    });

    // Reset form for next payment
    setFormMethod('CASH');
    setFormAmount('');
    setFormCashTendered('');
    setFormReference('');
    setFormInstallment('STRAIGHT');
  }, [receiptMissing, isCash, parsedAmount, parsedCashTendered, needsRef, formReference, formMethod, formInstallment, addPayment]);

  const handleRemovePayment = useCallback((id: string) => {
    removePayment(id);
  }, [removePayment]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigation.goBack();
    }
  }, [onBack, navigation]);

  const buildReceiptData = useCallback((saleNo: string): ReceiptData => {
    const location = locations.find(l => l.id === locationId);
    // Determine primary payment method for backward compat
    const primaryPayment = payments[0];
    const primaryMethod = primaryPayment?.method || 'CASH';

    return {
      header: {
        storeName: location?.name || 'APEX AUTO PARTS',
        address: location?.address || undefined,
      },
      transaction: {
        receiptNumber: saleNo,
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
        paymentMethod: primaryMethod,
        cashTendered: primaryMethod === 'CASH' ? payments.filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount, 0) : undefined,
        change: primaryMethod === 'CASH' && paidTotal > grandTotal ? paidTotal - grandTotal : undefined,
        payments: payments.map(p => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference || undefined,
          installmentTerm: p.method === 'CREDIT_CARD' && p.installmentTerm !== 'STRAIGHT' ? p.installmentTerm : undefined,
        })),
      },
      footer: { message: 'Thank you for your purchase!' },
    };
  }, [locations, locationId, payments, lines, subtotal, discount, grandTotal, paidTotal, user]);

  const handleCheckout = useCallback(async () => {
    // Retry loop: on 409 Conflict (receipt number collision), fetch next number and retry
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await checkout({ allowNegativeStock: allowNegativeStock || undefined });
      if (res) {
        const receiptData = buildReceiptData(res.saleNo);
        if (!printer.isConnected) {
          Alert.alert('Printer Offline', 'Receipt was not printed — no printer connected. You can reprint from the success screen.');
        } else {
          const printResult = await printer.printReceipt(receiptData).catch(() => ({ success: false, error: 'Print failed' }));
          if (printResult.success) {
            printer.openCashDrawer().catch(() => {});
          } else {
            Alert.alert('Print Notice', printResult.error || 'Receipt could not be printed. You can reprint from the success screen.');
          }
        }
        return; // Success — exit retry loop
      }

      // Check if the error was a 409 receipt conflict — if so, fetch next number and retry
      if (status === 'error' && error?.includes('409')) {
        try {
          const data = await apiFetch<{ receiptNumber: string }>('/sales/next-receipt-number');
          setReceiptNumber(data.receiptNumber);
          reset(); // Reset checkout state for retry
          continue; // Retry with new receipt number
        } catch {
          break; // Can't fetch next number, stop retrying
        }
      }
      break; // Non-409 error or success=null for other reasons — stop retrying
    }
  }, [checkout, buildReceiptData, printer, status, error, setReceiptNumber, reset, allowNegativeStock]);

  const handlePrintReceipt = useCallback(async () => {
    if (!result) return;
    const receiptData = buildReceiptData(result.saleNo);
    if (!printer.isConnected) {
      Alert.alert('Printer Offline', 'No printer connected.');
      return;
    }
    const printResult = await printer.printReceipt(receiptData).catch(() => ({ success: false, error: 'Print failed' }));
    if (printResult.success) {
      printer.openCashDrawer().catch(() => {});
    } else {
      Alert.alert('Print Notice', printResult.error || 'Receipt could not be printed.');
    }
  }, [result, buildReceiptData, printer]);

  const handleNewSale = useCallback(() => {
    clear();
    reset();
    if (onBack) {
      onBack();
    } else {
      navigation.navigate('Catalog' as never);
    }
  }, [clear, reset, onBack, navigation]);

  // ── Success state ──
  if (status === 'success' && result) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { padding: screenPadding }]}>
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>{'\u2713'}</Text>
            <Text style={styles.successTitle}>Sale Complete</Text>
            <Text style={styles.successReceipt}>{result.saleNo}</Text>
            <Text style={styles.successTotal}>{fmtPHP(parseFloat(result.grandTotal))}</Text>
            <View style={styles.successActions}>
              <Button title="Print Receipt" variant="secondary" fullWidth onPress={handlePrintReceipt} style={styles.successButton} />
              <Button title="New Sale" variant="primary" fullWidth onPress={handleNewSale} style={styles.successButton} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Pending offline state ──
  if (status === 'pending_offline') {
    const pendingCount = getPendingSales().length;
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { padding: screenPadding }]}>
          <View style={styles.successContainer}>
            <Text style={styles.pendingIcon}>{'\u23F3'}</Text>
            <Text style={styles.pendingTitle}>Sale Saved Offline</Text>
            <Text style={styles.pendingText}>
              Sale saved locally. It will be completed when the device is back online.
            </Text>
            {pendingCount > 0 && (
              <Text style={styles.pendingCount}>
                {pendingCount} pending sale{pendingCount !== 1 ? 's' : ''} queued
              </Text>
            )}
            <Button title="New Sale" variant="primary" fullWidth onPress={handleNewSale} style={styles.successButton} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main payment form ──
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        <Pressable onPress={handleBack} hitSlop={8}>
          <Text style={styles.backText}>{'\u2190'} Cart</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: screenPadding }]}>
        {/* Order Summary */}
        <Card style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{lineCount} item{lineCount !== 1 ? 's' : ''}</Text>
            <Text style={styles.summaryValue}>{fmtPHP(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount</Text>
              <Text style={[styles.summaryValue, { color: colors.status.success }]}>-{fmtPHP(discount)}</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{fmtPHP(grandTotal)}</Text>
          </View>
        </Card>

        {/* Receipt / Invoice Number */}
        <Card style={styles.receiptCard}>
          <Text style={styles.sectionTitle}>Receipt No. (auto-generated)</Text>
          <TextInput
            style={[styles.receiptInput, receiptMissing && styles.inputRequired, styles.receiptReadOnly]}
            placeholder={receiptLoading ? 'Loading...' : 'Receipt number'}
            placeholderTextColor={colors.text.muted}
            value={receiptNumber}
            editable={false}
          />
          {receiptMissing && !receiptLoading && (
            <Text style={styles.refRequiredText}>Receipt number is required</Text>
          )}
        </Card>

        {/* ── Added Payments List ── */}
        {payments.length > 0 && (
          <Card style={styles.paymentsListCard}>
            <Text style={styles.sectionTitle}>Payments</Text>
            {payments.map((p) => (
              <View key={p.id} style={styles.paymentRow}>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentMethod}>
                    {methodLabel(p.method)}
                    {p.method === 'CREDIT_CARD' && p.installmentTerm !== 'STRAIGHT'
                      ? ` \u00B7 ${installmentLabel(p.installmentTerm)}`
                      : ''}
                  </Text>
                  {p.reference ? (
                    <Text style={styles.paymentRef}>Ref: {p.reference}</Text>
                  ) : null}
                </View>
                <Text style={styles.paymentAmount}>{fmtPHP(p.amount)}</Text>
                <Pressable
                  onPress={() => handleRemovePayment(p.id)}
                  hitSlop={8}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeBtnText}>{'\u2715'}</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.paidLabel}>Paid</Text>
              <Text style={styles.paidValue}>{fmtPHP(paidTotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.remainingLabel}>
                {remaining > 0 ? 'Remaining' : 'Overpaid'}
              </Text>
              <Text style={[
                styles.remainingValue,
                { color: remaining > 0 ? colors.status.danger : colors.status.success },
              ]}>
                {remaining > 0 ? fmtPHP(remaining) : fmtPHP(Math.abs(remaining))}
              </Text>
            </View>
          </Card>
        )}

        {/* ── Add Payment Form ── */}
        {!isFullyPaid && (
          <Card style={styles.addPaymentCard}>
            <Text style={styles.sectionTitle}>
              {payments.length === 0 ? 'Payment Method' : 'Add Split Payment'}
            </Text>

            {/* Method grid */}
            <View style={styles.methodsGrid}>
              {PAYMENT_METHODS.map(m => {
                const active = formMethod === m.key;
                return (
                  <Pressable
                    key={m.key}
                    style={[styles.methodBtn, active && styles.methodBtnActive]}
                    onPress={() => {
                      setFormMethod(m.key);
                      // Pre-fill amount for non-cash methods
                      if (m.key !== 'CASH') {
                        const currentRemaining = grandTotal - paidTotal;
                        setFormAmount(currentRemaining > 0 ? currentRemaining.toFixed(2) : '');
                      } else {
                        setFormAmount('');
                      }
                    }}
                  >
                    <Text style={[styles.methodBtnText, active && styles.methodBtnTextActive]}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* CASH: compact denomination counter */}
            {isCash && (
              <View style={styles.formSection}>
                {/* Row 1: denomination chips — 4 columns */}
                <View style={styles.denomRow}>
                  <Pressable
                    style={[styles.denomChip, styles.denomExact]}
                    android_ripple={{ color: colors.accent.glow }}
                    onPress={() => setFormCashTendered(remaining.toFixed(2))}
                  >
                    <Text style={styles.denomExactText}>Exact</Text>
                  </Pressable>
                  {[1000, 500, 200, 100, 50, 20].map(d => (
                    <Pressable
                      key={d}
                      style={styles.denomChip}
                      android_ripple={{ color: colors.accent.glow }}
                      onPress={() => setFormCashTendered(String(parsedCashTendered + d))}
                    >
                      <Text style={styles.denomChipText}>+{d >= 1000 ? `${d / 1000}K` : d}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.denomChip, styles.denomClear]}
                    android_ripple={{ color: colors.status.danger + '40' }}
                    onPress={() => setFormCashTendered('')}
                  >
                    <Text style={styles.denomClearText}>C</Text>
                  </Pressable>
                </View>

                {/* Row 2: tendered amount + change — single compact row */}
                <View style={styles.cashRow}>
                  <View style={styles.cashRowLeft}>
                    <Text style={styles.cashRowLabel}>Tendered</Text>
                    <Text style={styles.cashRowAmount}>{fmtPHP(parsedCashTendered)}</Text>
                  </View>
                  {parsedCashTendered > 0 && remaining > 0 && (
                    <View style={styles.cashRowRight}>
                      {cashChange > 0 ? (
                        <>
                          <Text style={styles.cashRowLabel}>Change</Text>
                          <Text style={styles.cashRowChange}>{fmtPHP(cashChange)}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.cashRowLabel}>Remaining</Text>
                          <Text style={styles.cashRowRemaining}>{fmtPHP(remaining - parsedCashTendered)}</Text>
                        </>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Non-cash: Amount input */}
            {!isCash && (
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Amount</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder={defaultAmount || '0.00'}
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  value={formAmount}
                  onChangeText={setFormAmount}
                />
              </View>
            )}

            {/* Installment term (Credit Card only) */}
            {formMethod === 'CREDIT_CARD' && (
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Installment Term</Text>
                <View style={styles.installmentGrid}>
                  {INSTALLMENT_TERMS.map(t => {
                    const active = formInstallment === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        style={[styles.installmentChip, active && styles.installmentChipActive]}
                        onPress={() => setFormInstallment(t.key)}
                      >
                        <Text style={[styles.installmentChipText, active && styles.installmentChipTextActive]}>
                          {t.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Reference number (non-cash methods) */}
            {needsRef && (
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Reference / Approval #</Text>
                <TextInput
                  style={[styles.receiptInput, needsRef && !formReference.trim() && styles.inputRequired]}
                  placeholder="Enter reference number"
                  placeholderTextColor={colors.text.muted}
                  value={formReference}
                  onChangeText={setFormReference}
                  autoCapitalize="characters"
                />
              </View>
            )}

            {/* Add Payment button */}
            <Button
              title={payments.length === 0 ? 'Add Payment' : 'Add Split Payment'}
              variant="secondary"
              fullWidth
              onPress={handleAddPayment}
              style={styles.addPaymentButton}
            />
          </Card>
        )}

        {/* Error */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Charge Button */}
        <Button
          title={
            isProcessing
              ? 'Processing...'
              : isFullyPaid
                ? `Charge ${fmtPHP(grandTotal)}`
                : `${fmtPHP(remaining)} remaining`
          }
          variant="primary"
          fullWidth
          onPress={handleCheckout}
          disabled={isProcessing || lines.length === 0 || !isFullyPaid || receiptMissing}
          loading={isProcessing}
          style={styles.chargeButton}
          textStyle={styles.chargeButtonText}
        />
        {remaining > 0 && !isFullyPaid && (
          <Text style={styles.remainingHint}>
            Add payment(s) above to cover the remaining {fmtPHP(remaining)}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  backText: {
    ...textStyles.bodyMedium,
    color: colors.accent.primary,
    minWidth: 60,
  },
  headerTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  scrollContent: {
    paddingBottom: spacing['4xl'],
  },

  // ── Order Summary ──
  summaryCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  summaryValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.default,
    marginVertical: spacing.md,
  },
  totalLabel: {
    ...textStyles.subheading,
    color: colors.text.primary,
  },
  totalValue: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize['3xl'],
    color: colors.accent.primary,
  },

  // ── Receipt Number ──
  receiptCard: {
    marginBottom: spacing.md,
  },
  receiptInput: {
    ...textStyles.body,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.mono.medium,
  },
  receiptReadOnly: {
    backgroundColor: colors.bg.elevated,
    color: colors.text.secondary,
  },

  // ── Payments List ──
  paymentsListCard: {
    marginBottom: spacing.md,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentMethod: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  paymentRef: {
    ...textStyles.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  paymentAmount: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    marginHorizontal: spacing.md,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.status.danger + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.status.danger,
  },
  paidLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  paidValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  remainingLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  remainingValue: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.xl,
  },

  // ── Add Payment Form ──
  addPaymentCard: {
    marginBottom: spacing.md,
  },
  methodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  methodBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    minWidth: '47%',
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBtnActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  methodBtnText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  methodBtnTextActive: {
    color: colors.text.inverse,
    fontFamily: fonts.display.bold,
  },
  formSection: {
    marginBottom: spacing.md,
  },
  formLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInput: {
    ...textStyles.monoLg,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  denomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  denomChip: {
    width: '23.5%',
    paddingVertical: spacing.md,
    minHeight: touchTarget.min,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  denomChipText: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  denomExact: {
    borderColor: colors.accent.primary + '60',
    backgroundColor: colors.accent.primary + '15',
  },
  denomExactText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.accent.primary,
  },
  denomClear: {
    borderColor: colors.status.danger + '40',
    backgroundColor: colors.status.danger + '10',
  },
  denomClearText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.status.danger,
  },
  cashRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cashRowLeft: {
    flex: 1,
  },
  cashRowRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cashRowLabel: {
    ...textStyles.caption,
    color: colors.text.muted,
    fontSize: fontSize.xs,
  },
  cashRowAmount: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.xl,
    color: colors.accent.primary,
  },
  cashRowChange: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.xl,
    color: colors.status.success,
  },
  cashRowRemaining: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.lg,
    color: colors.text.secondary,
  },
  cashSummary: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    gap: spacing.sm,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  changeLabelValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  changeValue: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.xl,
    color: colors.status.success,
  },
  inputRequired: {
    borderColor: colors.status.danger,
  },
  refRequiredText: {
    ...textStyles.caption,
    color: colors.status.danger,
    marginTop: spacing.sm,
  },

  // ── Installment Term ──
  installmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  installmentChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
  },
  installmentChipActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  installmentChipText: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontFamily: fonts.display.medium,
  },
  installmentChipTextActive: {
    color: colors.text.inverse,
    fontFamily: fonts.display.bold,
  },

  // ── Add Payment button ──
  addPaymentButton: {
    marginTop: spacing.sm,
  },

  // ── Error ──
  errorText: {
    ...textStyles.caption,
    color: colors.status.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  // ── Charge ──
  chargeButton: {
    minHeight: 56,
    marginTop: spacing.md,
  },
  chargeButtonText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  remainingHint: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // ── Success ──
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
  },
  successIcon: {
    fontSize: 64,
    color: colors.status.success,
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...textStyles.display,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  successReceipt: {
    ...textStyles.monoMd,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  successTotal: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize['5xl'],
    color: colors.accent.primary,
    marginBottom: spacing['2xl'],
  },
  successActions: {
    width: '100%',
    gap: spacing.md,
  },
  successButton: {
    marginTop: spacing.sm,
  },
  pendingIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  pendingTitle: {
    ...textStyles.display,
    color: colors.status.warning,
    marginBottom: spacing.sm,
  },
  pendingText: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  pendingCount: {
    ...textStyles.caption,
    color: colors.status.warning,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
});
