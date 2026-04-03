import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  Animated,
  BackHandler,
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
import { Button } from '@/components/ui';

/* ────────────────────────────────────────────────── */
/*  Helpers                                            */
/* ────────────────────────────────────────────────── */

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STANDARD_METHODS = [
  { key: 'CASH', label: 'Cash', needsRef: false },
  { key: 'GCASH', label: 'GCash', needsRef: true },
  { key: 'CREDIT_CARD', label: 'Card', needsRef: true },
  { key: 'DEBIT_CARD', label: 'Debit', needsRef: true },
  { key: 'QRPH', label: 'QRPH', needsRef: true },
  { key: 'MAYA', label: 'Maya', needsRef: true },
  { key: 'BANK_TRANSFER', label: 'Bank', needsRef: true },
];

const INSTALLMENT_TERMS = [
  { key: 'STRAIGHT', label: 'Straight' },
  { key: '3_MONTHS', label: '3 Mo' },
  { key: '6_MONTHS', label: '6 Mo' },
  { key: '12_MONTHS', label: '12 Mo' },
];

const METHODS_NEEDING_REF = new Set(
  STANDARD_METHODS.filter(m => m.needsRef).map(m => m.key),
);

function methodLabel(key: string): string {
  if (key === 'CHARGE') return 'Charge';
  return STANDARD_METHODS.find(m => m.key === key)?.label || key;
}

function installmentLabel(key: string): string {
  return INSTALLMENT_TERMS.find(t => t.key === key)?.label || key;
}

/* ────────────────────────────────────────────────── */
/*  Component                                          */
/* ────────────────────────────────────────────────── */

interface PaymentScreenProps {
  onBack?: () => void;
}

export default function PaymentScreen({ onBack }: PaymentScreenProps) {
  const navigation = useNavigation();
  const { isTablet, screenPadding } = useLayout();
  const { user, locations, locationId } = useAuth();
  const printer = usePrinter();

  // ── Cart store ──
  const lines = useCartStore(s => s.lines);
  const payments = useCartStore(s => s.payments);
  const receiptNumber = useCartStore(s => s.receiptNumber);
  const setReceiptNumber = useCartStore(s => s.setReceiptNumber);
  const addPayment = useCartStore(s => s.addPayment);
  const removePayment = useCartStore(s => s.removePayment);
  const clearPayments = useCartStore(s => s.clearPayments);
  const clear = useCartStore(s => s.clear);
  const customerName = useCartStore(s => s.customerName);
  const customerId = useCartStore(s => s.customerId);

  const allowNegativeStock = useCartStore(s => s.allowNegativeStock);
  const subtotal = useCartStore(selectSubtotal);
  const discount = useCartStore(selectCartDiscount);
  const grandTotal = useCartStore(selectGrandTotal);
  const paidTotal = useCartStore(selectPaidTotal);
  const remaining = useCartStore(selectRemainingBalance);
  const lineCount = useCartStore(selectLineCount);

  const { status, error, result, checkout, reset } = useCheckout();
  const isProcessing = status === 'creating' || status === 'completing';

  // ── Unit count ──
  const unitCount = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  // ── VAT calculation (12% inclusive) ──
  const vatAmount = useMemo(() => grandTotal - grandTotal / 1.12, [grandTotal]);

  // ── Item summary text ──
  const itemSummaryText = useMemo(() => {
    const names = lines.slice(0, 3).map(l => l.sku || l.name);
    const extra = lines.length > 3 ? `, +${lines.length - 3} more` : '';
    return names.join(', ') + extra;
  }, [lines]);

  // ── Fetch next receipt number ──
  const [receiptLoading, setReceiptLoading] = useState(true);

  const fetchNextReceiptNumber = useCallback(async () => {
    try {
      const data = await apiFetch<{ receiptNumber: string }>('/sales/next-receipt-number');
      setReceiptNumber(data.receiptNumber);
    } catch {
      setReceiptNumber(`OFFLINE-${Date.now()}`);
    } finally {
      setReceiptLoading(false);
    }
  }, [setReceiptNumber]);

  useEffect(() => {
    fetchNextReceiptNumber();
  }, [fetchNextReceiptNumber]);

  // ── Inline receipt editing ──
  const [editingReceipt, setEditingReceipt] = useState(false);

  // ── Form state ──
  const [formMethod, setFormMethod] = useState('CASH');
  const [formAmount, setFormAmount] = useState('');
  const [formCashTendered, setFormCashTendered] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formInstallment, setFormInstallment] = useState('STRAIGHT');

  // ── Flash animation for tendered input ──
  const flashAnim = useRef(new Animated.Value(0)).current;
  const flashBorder = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border.medium, colors.accent.primary],
  });

  const flashTenderedInput = useCallback(() => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [flashAnim]);

  const isFullyPaid = remaining <= 0 && payments.length > 0;
  const needsRef = METHODS_NEEDING_REF.has(formMethod);
  const isCash = formMethod === 'CASH';
  const isCharge = formMethod === 'CHARGE';

  const parsedCashTendered = parseFloat(formCashTendered) || 0;

  // For CASH: payment amount = min(tendered, remaining)
  // For non-cash: payment amount = explicit amount field (or remaining)
  const defaultAmount = useMemo(() => {
    return remaining > 0 ? remaining.toFixed(2) : '';
  }, [remaining]);

  const parsedAmount = isCash
    ? Math.min(parsedCashTendered, remaining > 0 ? remaining : parsedCashTendered)
    : parseFloat(formAmount || defaultAmount) || 0;

  // Cash change — real-time as the cashier enters tendered
  const cashChange = isCash && parsedCashTendered > remaining && remaining > 0
    ? parsedCashTendered - remaining
    : 0;

  // Can the cashier add a payment right now?
  const canAddPayment = isCash ? parsedCashTendered > 0 : parsedAmount > 0;

  // Single payment covers entire remaining? Skip Add Payment → go straight to Complete
  const singlePaymentCoversAll = payments.length === 0 && (
    (isCash && parsedCashTendered >= remaining && parsedCashTendered > 0) ||
    (!isCash && parsedAmount >= remaining && parsedAmount > 0)
  );

  const receiptMissing = !receiptNumber.trim();

  // ── Auto-checkout after single payment covers all ──
  const [pendingAutoCheckout, setPendingAutoCheckout] = useState(false);

  // Note: handleCheckout is defined below via useCallback. React evaluates all hooks
  // in order on each render, so the ref is stable by the time the effect runs.
  const autoCheckoutRef = useRef<(() => void) | undefined>(undefined);

  // ── Undo state for Clear ──
  const [undoAmount, setUndoAmount] = useState<number | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = useCallback(() => {
    setFormAmount('');
    setFormCashTendered('');
    setFormReference('');
    setFormInstallment('STRAIGHT');
  }, []);

  // ── Add Payment handler ──
  const handleAddPayment = useCallback(() => {
    if (receiptMissing) {
      Alert.alert('Receipt Required', 'Please enter the receipt number.');
      return;
    }
    if (isCash) {
      if (parsedCashTendered <= 0) {
        Alert.alert('Enter Cash', 'Please enter the cash amount tendered.');
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

    addPayment({
      method: formMethod,
      amount: parsedAmount,
      reference: formReference.trim(),
      installmentTerm: formMethod === 'CREDIT_CARD' ? formInstallment : 'STRAIGHT',
    });

    // Reset form for next payment
    resetForm();
  }, [receiptMissing, isCash, parsedAmount, parsedCashTendered, needsRef, formReference, formMethod, formInstallment, addPayment, resetForm]);

  // ── Single payment complete (skip Add Payment step) ──
  const handleSinglePaymentComplete = useCallback(() => {
    if (receiptMissing) {
      Alert.alert('Receipt Required', 'Please enter the receipt number.');
      return;
    }
    if (isCash && parsedCashTendered <= 0) return;
    if (!isCash && parsedAmount <= 0) return;
    if (needsRef && !formReference.trim()) {
      Alert.alert('Reference Required', 'Please enter a reference / approval number.');
      return;
    }

    // Add the payment first, then auto-checkout via useEffect
    addPayment({
      method: formMethod,
      amount: parsedAmount,
      reference: formReference.trim(),
      installmentTerm: formMethod === 'CREDIT_CARD' ? formInstallment : 'STRAIGHT',
    });
    resetForm();
    setPendingAutoCheckout(true);
  }, [receiptMissing, isCash, parsedCashTendered, parsedAmount, needsRef, formReference, formMethod, formInstallment, addPayment, resetForm]);

  const handleRemovePayment = useCallback((id: string) => {
    removePayment(id);
  }, [removePayment]);

  // ── Back navigation with confirmation ──
  const handleBack = useCallback(() => {
    const hasProgress = payments.length > 0 || parsedCashTendered > 0 || parseFloat(formAmount) > 0;

    if (!hasProgress) {
      if (onBack) onBack();
      else navigation.goBack();
      return;
    }

    Alert.alert(
      'Discard Payment?',
      'You have payment information entered. Going back will discard it.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Discard & Go Back',
          style: 'destructive',
          onPress: () => {
            clearPayments();
            resetForm();
            if (onBack) onBack();
            else navigation.goBack();
          },
        },
      ],
    );
  }, [payments, parsedCashTendered, formAmount, onBack, navigation, clearPayments, resetForm]);

  // ── Android hardware back ──
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => handler.remove();
  }, [handleBack]);

  // ── Charge method handler ──
  const handleChargeSelect = useCallback(() => {
    if (!customerId) {
      Alert.alert(
        'Customer Required',
        'Please add a customer to the order before using Charge payment.',
        [{ text: 'OK' }],
      );
      return;
    }
    setFormMethod('CHARGE');
    setFormAmount(remaining > 0 ? remaining.toFixed(2) : '');
  }, [customerId, remaining]);

  // ── Quick amount helpers ──
  const addToTendered = useCallback((amount: number) => {
    const newAmount = parsedCashTendered + amount;
    setFormCashTendered(String(newAmount));
    flashTenderedInput();
  }, [parsedCashTendered, flashTenderedInput]);

  const handleClearTendered = useCallback(() => {
    if (parsedCashTendered === 0) return;
    const prev = parsedCashTendered;
    setFormCashTendered('');
    setUndoAmount(prev);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoAmount(null), 4000);
  }, [parsedCashTendered]);

  const handleUndoClear = useCallback(() => {
    if (undoAmount !== null) {
      setFormCashTendered(String(undoAmount));
      setUndoAmount(null);
      if (undoTimer.current) clearTimeout(undoTimer.current);
    }
  }, [undoAmount]);

  // ── Build receipt data ──
  const buildReceiptData = useCallback((saleNo: string): ReceiptData => {
    const location = locations.find(l => l.id === locationId);
    const primaryPayment = payments[0];
    const primaryMethod = primaryPayment?.method || 'CASH';

    return {
      header: {
        storeName: location?.name || 'CBROS GENUINE AUTOPARTS',
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

  // ── Checkout ──
  const handleCheckout = useCallback(async () => {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await checkout({ allowNegativeStock: allowNegativeStock || undefined });
      if (res) {
        const receiptData = buildReceiptData(res.saleNo);
        if (!printer.isConnected) {
          Alert.alert('Printer Offline', 'Receipt was not printed — no printer connected.');
        } else {
          const printResult = await printer.printReceipt(receiptData).catch(() => ({ success: false, error: 'Print failed' }));
          if (printResult.success) {
            printer.openCashDrawer().catch(() => {});
          } else {
            Alert.alert('Print Notice', printResult.error || 'Receipt could not be printed.');
          }
        }
        return;
      }
      if (status === 'error' && error?.includes('409')) {
        try {
          const data = await apiFetch<{ receiptNumber: string }>('/sales/next-receipt-number');
          setReceiptNumber(data.receiptNumber);
          reset();
          continue;
        } catch {
          break;
        }
      }
      break;
    }
  }, [checkout, buildReceiptData, printer, status, error, setReceiptNumber, reset, allowNegativeStock]);

  // Keep ref in sync for auto-checkout effect
  autoCheckoutRef.current = handleCheckout;

  useEffect(() => {
    if (pendingAutoCheckout && isFullyPaid && !isProcessing) {
      setPendingAutoCheckout(false);
      autoCheckoutRef.current?.();
    }
  }, [pendingAutoCheckout, isFullyPaid, isProcessing]);

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
    if (onBack) onBack();
    else navigation.navigate('Catalog' as never);
  }, [clear, reset, onBack, navigation]);

  const s = styles;

  /* ── Success state ── */
  if (status === 'success' && result) {
    const totalChange = paidTotal > grandTotal ? paidTotal - grandTotal : 0;
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successContainer}>
          <Text style={s.successIcon}>{'\u2713'}</Text>
          <Text style={s.successTitle}>Sale Complete</Text>
          <Text style={s.successReceipt}>{result.saleNo}</Text>
          <Text style={s.successTotal}>{fmtPHP(parseFloat(result.grandTotal))}</Text>
          {totalChange > 0 && (
            <Text style={s.successChange}>Change: {fmtPHP(totalChange)}</Text>
          )}
          <View style={s.successActions}>
            <Button title="Print Receipt" variant="secondary" fullWidth onPress={handlePrintReceipt} />
            <Button title="New Sale" variant="primary" fullWidth onPress={handleNewSale} style={{ marginTop: 8 }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ── Pending offline state ── */
  if (status === 'pending_offline') {
    const pendingCount = getPendingSales().length;
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successContainer}>
          <Text style={s.pendingIcon}>{'\u23F3'}</Text>
          <Text style={s.pendingTitle}>Sale Saved Offline</Text>
          <Text style={s.pendingText}>
            Sale saved locally. It will sync when back online.
          </Text>
          {pendingCount > 0 && (
            <Text style={s.pendingCount}>
              {pendingCount} pending sale{pendingCount !== 1 ? 's' : ''} queued
            </Text>
          )}
          <Button title="New Sale" variant="primary" fullWidth onPress={handleNewSale} />
        </View>
      </SafeAreaView>
    );
  }

  /* ════════════════════════════════════════════════ */
  /*  MAIN PAYMENT FORM — NO SCROLL LAYOUT           */
  /* ════════════════════════════════════════════════ */
  return (
    <SafeAreaView style={s.container}>
      <View style={s.paymentContainer}>

        {/* ── 1. Order Summary (compressed) ── */}
        <View style={s.orderSummary}>
          <View style={s.summaryHeader}>
            <Pressable onPress={handleBack} hitSlop={8} style={s.backBtn}>
              <Text style={s.backText}>{'\u2190'} Cart</Text>
            </Pressable>
            <Text style={s.summaryTotalAmount}>{fmtPHP(grandTotal)}</Text>
          </View>

          <Text style={s.summaryLine1}>
            {lineCount} {lineCount === 1 ? 'product' : 'products'} {'·'} {unitCount} unit{unitCount !== 1 ? 's' : ''}
            {discount > 0 ? ` · disc. ${fmtPHP(discount)}` : ''}
          </Text>
          <Text style={s.summaryLine2} numberOfLines={1}>
            {itemSummaryText}
          </Text>
          <View style={s.summaryMetaRow}>
            {editingReceipt ? (
              <TextInput
                value={receiptNumber}
                onChangeText={setReceiptNumber}
                onBlur={() => setEditingReceipt(false)}
                autoFocus
                style={s.receiptInlineInput}
                selectTextOnFocus
              />
            ) : (
              <Text style={s.summaryMeta} onPress={() => setEditingReceipt(true)}>
                {receiptLoading ? 'Loading...' : `Receipt: ${receiptNumber}`}
              </Text>
            )}
            <Text style={s.summaryMeta}>
              {' · '}VATable: {fmtPHP(grandTotal / 1.12)} + VAT: {fmtPHP(vatAmount)}
            </Text>
            {customerName ? (
              <Text style={s.summaryMeta}>
                {' · '}{customerName}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── 2. Applied Payments (split entries) ── */}
        {payments.length > 0 && (
          <View style={s.appliedPayments}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.appliedRow}>
                {payments.map(p => (
                  <View key={p.id} style={s.appliedChip}>
                    <Text style={s.appliedChipMethod}>
                      {methodLabel(p.method)}
                      {p.method === 'CREDIT_CARD' && p.installmentTerm !== 'STRAIGHT'
                        ? ` ${installmentLabel(p.installmentTerm)}`
                        : ''}
                    </Text>
                    <Text style={s.appliedChipAmount}>{fmtPHP(p.amount)}</Text>
                    <Pressable
                      onPress={() => handleRemovePayment(p.id)}
                      hitSlop={8}
                      style={s.appliedChipRemove}
                    >
                      <Text style={s.appliedChipRemoveText}>{'\u2715'}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
            <View style={s.appliedSummaryRow}>
              <Text style={s.appliedPaidLabel}>Paid: {fmtPHP(paidTotal)}</Text>
              {remaining > 0 && (
                <Text style={s.appliedRemainingLabel}>Remaining: {fmtPHP(remaining)}</Text>
              )}
            </View>
          </View>
        )}

        {/* ── 3. Payment Method Selector ── */}
        {!isFullyPaid && (
          <View style={s.methodsSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.methodsRow}>
                {STANDARD_METHODS.map(m => {
                  const active = formMethod === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      style={[s.methodBtn, active && s.methodBtnActive]}
                      onPress={() => {
                        setFormMethod(m.key);
                        if (m.key !== 'CASH') {
                          setFormAmount(remaining > 0 ? remaining.toFixed(2) : '');
                        } else {
                          setFormAmount('');
                        }
                      }}
                    >
                      <Text style={[s.methodBtnText, active && s.methodBtnTextActive]}>
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
                {/* Charge — visually distinct */}
                <Pressable
                  style={[
                    s.chargeMethodBtn,
                    isCharge && s.chargeMethodBtnActive,
                    !customerId && s.chargeMethodBtnDisabled,
                  ]}
                  onPress={handleChargeSelect}
                >
                  <Text style={[s.chargeMethodText, isCharge && s.chargeMethodTextActive]}>
                    {'\u26A0'} Charge
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        )}

        {/* ── 4. Tendered Amount + Change (CASH) ── */}
        {!isFullyPaid && isCash && (
          <View style={s.tenderedSection}>
            <Animated.View style={[s.tenderedInputRow, { borderColor: flashBorder }]}>
              <Text style={s.tenderedCurrency}>{'\u20B1'}</Text>
              <TextInput
                style={s.tenderedInput}
                value={formCashTendered}
                onChangeText={setFormCashTendered}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
                selectTextOnFocus
              />
              {parsedCashTendered > 0 && cashChange > 0 && (
                <View style={s.changeInline}>
                  <Text style={s.changeLabel}>Change</Text>
                  <Text style={s.changeAmount}>{fmtPHP(cashChange)}</Text>
                </View>
              )}
              {parsedCashTendered > 0 && cashChange === 0 && remaining > parsedCashTendered && (
                <View style={s.changeInline}>
                  <Text style={s.remainingInlineLabel}>Still due</Text>
                  <Text style={s.remainingInlineAmount}>{fmtPHP(remaining - parsedCashTendered)}</Text>
                </View>
              )}
            </Animated.View>
            {/* Undo bar */}
            {undoAmount !== null && (
              <Pressable onPress={handleUndoClear} style={s.undoBar}>
                <Text style={s.undoText}>
                  Cleared {fmtPHP(undoAmount)} — tap to undo
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── 4b. Amount Input (non-cash, non-charge) ── */}
        {!isFullyPaid && !isCash && !isCharge && (
          <View style={s.tenderedSection}>
            <View style={s.tenderedInputRowStatic}>
              <Text style={s.tenderedCurrency}>{'\u20B1'}</Text>
              <TextInput
                style={s.tenderedInput}
                value={formAmount}
                onChangeText={setFormAmount}
                keyboardType="decimal-pad"
                placeholder={defaultAmount || '0.00'}
                placeholderTextColor={colors.text.muted}
                selectTextOnFocus
              />
            </View>
            {/* Installment term (Credit Card only) */}
            {formMethod === 'CREDIT_CARD' && (
              <View style={s.installmentRow}>
                {INSTALLMENT_TERMS.map(t => {
                  const active = formInstallment === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      style={[s.installmentChip, active && s.installmentChipActive]}
                      onPress={() => setFormInstallment(t.key)}
                    >
                      <Text style={[s.installmentChipText, active && s.installmentChipTextActive]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {/* Reference input */}
            {needsRef && (
              <TextInput
                style={[s.refInput, needsRef && !formReference.trim() && s.refInputRequired]}
                placeholder="Reference / Approval #"
                placeholderTextColor={colors.text.muted}
                value={formReference}
                onChangeText={setFormReference}
                autoCapitalize="characters"
              />
            )}
          </View>
        )}

        {/* ── 4c. Charge summary ── */}
        {!isFullyPaid && isCharge && (
          <View style={s.tenderedSection}>
            <View style={s.chargeSummary}>
              <Text style={s.chargeCustomerName}>
                Charging to: {customerName || 'No customer'}
              </Text>
              <Text style={s.chargeAmountDisplay}>{fmtPHP(remaining)}</Text>
            </View>
          </View>
        )}

        {/* ── 5. Quick Amount Buttons (CASH only) ── */}
        {!isFullyPaid && isCash && (
          <View style={s.quickRow}>
            <Pressable
              style={s.quickBtnExact}
              onPress={() => {
                const exactAmt = remaining > 0 ? remaining : grandTotal;
                setFormCashTendered(exactAmt.toFixed(2));
                flashTenderedInput();
              }}
            >
              <Text style={s.quickBtnExactText}>Exact</Text>
            </Pressable>
            <Pressable style={s.quickBtnLg} onPress={() => addToTendered(1000)}>
              <Text style={s.quickBtnText}>+1K</Text>
            </Pressable>
            <Pressable style={s.quickBtnLg} onPress={() => addToTendered(500)}>
              <Text style={s.quickBtnText}>+500</Text>
            </Pressable>
            <Pressable style={s.quickBtnSm} onPress={() => addToTendered(200)}>
              <Text style={s.quickBtnText}>+200</Text>
            </Pressable>
            <Pressable style={s.quickBtnSm} onPress={() => addToTendered(100)}>
              <Text style={s.quickBtnText}>+100</Text>
            </Pressable>
            <Pressable style={s.quickBtnSm} onPress={() => addToTendered(50)}>
              <Text style={s.quickBtnText}>+50</Text>
            </Pressable>
            <Pressable
              style={[s.quickBtnClear, parsedCashTendered === 0 && { opacity: 0.3 }]}
              onPress={handleClearTendered}
              disabled={parsedCashTendered === 0}
            >
              <Text style={s.quickBtnClearText}>C</Text>
            </Pressable>
          </View>
        )}

        {/* Spacer to push action to bottom */}
        <View style={{ flex: 1 }} />

        {/* ── Error ── */}
        {error && <Text style={s.errorText}>{error}</Text>}

        {/* ── 6. Action Button — pinned at bottom ── */}
        <View style={s.actionSection}>
          {isFullyPaid ? (
            /* Fully paid via split payments → Complete Sale */
            <Pressable
              style={[s.completeSaleBtn, isProcessing && { opacity: 0.6 }]}
              onPress={handleCheckout}
              disabled={isProcessing || receiptMissing}
            >
              <Text style={s.completeSaleBtnText}>
                {isProcessing ? 'Processing...' : (
                  paidTotal > grandTotal
                    ? `COMPLETE SALE · Change: ${fmtPHP(paidTotal - grandTotal)}`
                    : 'COMPLETE SALE'
                )}
              </Text>
            </Pressable>
          ) : singlePaymentCoversAll ? (
            /* Single payment covers everything → Complete Sale shortcut */
            <Pressable
              style={[s.completeSaleBtn, isProcessing && { opacity: 0.6 }]}
              onPress={() => {
                handleSinglePaymentComplete();
              }}
              disabled={isProcessing || receiptMissing}
            >
              <Text style={s.completeSaleBtnText}>
                {isProcessing ? 'Processing...' : (
                  cashChange > 0
                    ? `COMPLETE SALE · Change: ${fmtPHP(cashChange)}`
                    : `COMPLETE SALE · ${fmtPHP(grandTotal)}`
                )}
              </Text>
            </Pressable>
          ) : (
            /* Not fully paid → Add Payment */
            <>
              <Pressable
                style={[
                  s.addPaymentBtn,
                  !canAddPayment && s.addPaymentBtnDisabled,
                ]}
                onPress={handleAddPayment}
                disabled={!canAddPayment || receiptMissing}
              >
                <Text style={[
                  s.addPaymentBtnText,
                  !canAddPayment && s.addPaymentBtnTextDisabled,
                ]}>
                  {canAddPayment
                    ? `ADD PAYMENT · ${fmtPHP(parsedAmount)}`
                    : 'ADD PAYMENT'}
                </Text>
              </Pressable>
              {remaining > 0 && !canAddPayment && (
                <Text style={s.remainingHint}>
                  {fmtPHP(remaining)} remaining
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ════════════════════════════════════════════════════ */
/*  Styles                                              */
/* ════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  /* ── No-scroll root layout ── */
  paymentContainer: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },

  /* ── 1. Order Summary (compressed) ── */
  orderSummary: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: spacing.lg,
    minHeight: 40,
    justifyContent: 'center',
  },
  backText: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.base,
    color: colors.accent.primary,
  },
  summaryTotalAmount: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize['4xl'],
    color: colors.accent.primary,
  },
  summaryLine1: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    marginBottom: 1,
  },
  summaryLine2: {
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    color: colors.text.muted,
    marginBottom: 2,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  summaryMeta: {
    fontFamily: fonts.body.regular,
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },
  receiptInlineInput: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSize.xs,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.focus,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 120,
  },

  /* ── 2. Applied Payments ── */
  appliedPayments: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  appliedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  appliedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.glow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    gap: 6,
  },
  appliedChipMethod: {
    fontFamily: fonts.display.medium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  appliedChipAmount: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  appliedChipRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.status.dangerBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appliedChipRemoveText: {
    fontSize: 9,
    color: colors.status.danger,
    fontFamily: fonts.display.bold,
  },
  appliedSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  appliedPaidLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  appliedRemainingLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.status.danger,
  },

  /* ── 3. Payment Methods ── */
  methodsSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  methodsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  methodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: 'transparent',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBtnActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  methodBtnText: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.md,
    color: colors.text.secondary,
  },
  methodBtnTextActive: {
    color: colors.text.inverse,
    fontFamily: fonts.display.bold,
  },
  chargeMethodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.status.warning,
    borderStyle: 'dashed' as any,
    backgroundColor: 'transparent',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  chargeMethodBtnActive: {
    borderStyle: 'solid' as any,
    backgroundColor: colors.status.warningBg,
  },
  chargeMethodBtnDisabled: {
    opacity: 0.35,
  },
  chargeMethodText: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.md,
    color: colors.status.warning,
  },
  chargeMethodTextActive: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
  },

  /* ── 4. Tendered Input ── */
  tenderedSection: {
    paddingVertical: spacing.sm,
  },
  tenderedInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 52,
  },
  tenderedInputRowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    paddingHorizontal: 14,
    height: 52,
  },
  tenderedCurrency: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['3xl'],
    color: colors.text.muted,
    marginRight: 6,
  },
  tenderedInput: {
    flex: 1,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['4xl'],
    color: colors.text.primary,
    padding: 0,
  },
  changeInline: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  changeLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.status.success,
  },
  changeAmount: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize['2xl'],
    color: colors.status.success,
  },
  remainingInlineLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },
  remainingInlineAmount: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSize.lg,
    color: colors.text.secondary,
  },
  undoBar: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.status.infoBg,
    alignSelf: 'center',
  },
  undoText: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.status.info,
  },

  /* Installment row */
  installmentRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  installmentChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  installmentChipTextActive: {
    color: colors.text.inverse,
    fontFamily: fonts.display.bold,
  },

  /* Ref input */
  refInput: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
    color: colors.text.primary,
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  refInputRequired: {
    borderColor: colors.status.danger,
  },

  /* Charge summary */
  chargeSummary: {
    backgroundColor: colors.status.warningBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chargeCustomerName: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.md,
    color: colors.status.warning,
    marginBottom: 4,
  },
  chargeAmountDisplay: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['3xl'],
    color: colors.text.primary,
  },

  /* ── 5. Quick Amount Buttons ── */
  quickRow: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: spacing.xs,
  },
  quickBtnLg: {
    flex: 1.5,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  quickBtnSm: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  quickBtnText: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.md,
    color: colors.text.secondary,
  },
  quickBtnExact: {
    flex: 1.2,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.muted,
    borderWidth: 1,
    borderColor: colors.accent.primary + '60',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  quickBtnExactText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.accent.primary,
  },
  quickBtnClear: {
    width: 42,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.status.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  quickBtnClearText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
    color: colors.status.danger,
  },

  /* ── Error ── */
  errorText: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.status.danger,
    textAlign: 'center',
    marginBottom: 4,
  },

  /* ── 6. Action Button ── */
  actionSection: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  completeSaleBtn: {
    backgroundColor: colors.status.success,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
    shadowColor: colors.status.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  completeSaleBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  addPaymentBtn: {
    backgroundColor: colors.accent.primary,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  addPaymentBtnDisabled: {
    backgroundColor: colors.bg.overlay,
  },
  addPaymentBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
    color: colors.text.inverse,
    letterSpacing: 0.5,
  },
  addPaymentBtnTextDisabled: {
    color: colors.text.muted,
  },
  remainingHint: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 6,
  },

  /* ── Success / Pending states ── */
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
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
    marginBottom: spacing.sm,
  },
  successChange: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    color: colors.status.success,
    marginBottom: spacing['2xl'],
  },
  successActions: {
    width: '100%',
    marginTop: spacing.xl,
    gap: spacing.sm,
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
