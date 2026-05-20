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
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
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
import { useCheckout, type CheckoutOverrideApproval } from '@/hooks/use-checkout';
import { apiFetch, ApiError } from '@/services/api-client';
import { getPendingSales } from '@/storage/pending-sales';
import { usePrinter } from '@/hardware/printer/context';
import { printReceiptSafely } from '@/hardware/printer/settings';
import type { ReceiptData } from '@/hardware/printer/types';
import { useAuth } from '@/hooks/use-auth';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, radius, fonts, fontSize, touchTarget } from '@/theme';
import { Button, Icon, type IconName } from '@/components/ui';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { ReceiptDataPreviewModal } from '@/components/ReceiptDataPreviewModal';
import { getLockedLocationId } from '@/config/device-binding';
import { buildPaymentActionPreflight } from '@/utils/checkout-preflight';
import { formatPosError } from '@/utils/pos-error-messages';
import type { PaymentIntent } from '@/app/MainTabs';

/* ────────────────────────────────────────────────── */
/*  Helpers                                            */
/* ────────────────────────────────────────────────── */

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONEY_EPSILON = 0.005;

function getCashTendered(payments: PaymentEntry[]): number {
  return payments
    .filter(p => p.method === 'CASH')
    .reduce((sum, p) => sum + (p.cashTendered ?? p.amount), 0);
}

function getCashChange(payments: PaymentEntry[]): number {
  const cashApplied = payments
    .filter(p => p.method === 'CASH')
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, getCashTendered(payments) - cashApplied);
}

function hasCashPayment(payments: PaymentEntry[]): boolean {
  return payments.some(p => p.method === 'CASH' && p.amount > 0);
}

interface PaymentMethodOption {
  key: string;
  label: string;
  needsRef: boolean;
  icon: IconName;
}

type ReceiptPrintState = 'idle' | 'printed' | 'failed';
type DrawerCommandState = 'idle' | 'sent' | 'skipped' | 'failed';

const STANDARD_METHODS: PaymentMethodOption[] = [
  { key: 'CASH', label: 'Cash', needsRef: false, icon: 'cash' },
  { key: 'GCASH', label: 'GCash', needsRef: true, icon: 'receipt' },
  { key: 'CREDIT_CARD', label: 'Card', needsRef: true, icon: 'card' },
  { key: 'DEBIT_CARD', label: 'Debit', needsRef: true, icon: 'card' },
  { key: 'QRPH', label: 'QRPH', needsRef: true, icon: 'barcode' },
  { key: 'MAYA', label: 'Maya', needsRef: true, icon: 'receipt' },
  { key: 'BANK_TRANSFER', label: 'Bank', needsRef: true, icon: 'sync' },
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

interface AccountOverrideState extends CheckoutOverrideApproval {
  approverName: string;
  credential: string;
  method: 'pin' | 'barcode' | 'card';
}

interface AccountCreditCheckResult {
  customerId: string;
  customerName: string;
  canCharge: boolean;
  requiresOverride: boolean;
  unlimited: boolean;
  currentBalance: string;
  creditLimit: string;
  chargeAmount: string;
  newBalance: string;
  overage: string;
}

interface CashTenderOption {
  label: string;
  amount: number;
  exact?: boolean;
}

function methodLabel(key: string): string {
  if (key === 'CHARGE') return 'Charge';
  return STANDARD_METHODS.find(m => m.key === key)?.label || key;
}

function receiptPaymentLabel(key: string): string {
  if (key === 'CHARGE') return 'CHARGE TO ACCOUNT';
  return key;
}

function installmentLabel(key: string): string {
  return INSTALLMENT_TERMS.find(t => t.key === key)?.label || key;
}

function buildCashTenderOptions(due: number, total: number): CashTenderOption[] {
  const base = due > MONEY_EPSILON ? due : total;
  if (base <= MONEY_EPSILON) return [];

  const roundTo = (step: number) => Math.ceil(base / step) * step;
  const options: CashTenderOption[] = [
    { label: 'Exact', amount: Math.round(base * 100) / 100, exact: true },
    { label: 'Round 50', amount: roundTo(50) },
    { label: 'Round 100', amount: roundTo(100) },
    { label: 'Round 500', amount: roundTo(500) },
    { label: 'Round 1K', amount: roundTo(1000) },
  ];

  const seen = new Set<string>();
  return options.filter(option => {
    const key = option.amount.toFixed(2);
    if (seen.has(key)) return false;
    seen.add(key);
    return option.amount > 0;
  });
}

/* ────────────────────────────────────────────────── */
/*  Component                                          */
/* ────────────────────────────────────────────────── */

interface PaymentScreenProps {
  onBack?: () => void;
  initialMethod?: PaymentIntent;
}

export default function PaymentScreen({ onBack, initialMethod = 'CASH' }: PaymentScreenProps) {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
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

  const { status, error, lastApiError, result, checkout, reset } = useCheckout();
  const isProcessing = status === 'creating' || status === 'completing';
  const isRegisterLocked = !!getLockedLocationId();
  const [creditOverrideVisible, setCreditOverrideVisible] = useState(false);
  const [accountOverride, setAccountOverride] = useState<AccountOverrideState | null>(null);
  const [accountCreditCheck, setAccountCreditCheck] = useState<AccountCreditCheckResult | null>(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [receiptPrinting, setReceiptPrinting] = useState(false);
  const [receiptPrintState, setReceiptPrintState] = useState<ReceiptPrintState>('idle');
  const [drawerCommandState, setDrawerCommandState] = useState<DrawerCommandState>('idle');
  const [completedReceiptData, setCompletedReceiptData] = useState<ReceiptData | null>(null);
  const [completedChange, setCompletedChange] = useState(0);

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
    if (receiptNumber.trim()) {
      setReceiptLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ receiptNumber: string }>('/sales/next-receipt-number');
      setReceiptNumber(data.receiptNumber);
    } catch {
      setReceiptNumber(`OFFLINE-${Date.now()}`);
    } finally {
      setReceiptLoading(false);
    }
  }, [receiptNumber, setReceiptNumber]);

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
  const [paymentFlowMode, setPaymentFlowMode] = useState<'single' | 'split'>(
    initialMethod === 'SPLIT' ? 'split' : 'single',
  );

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

  const isFullyPaid = remaining <= MONEY_EPSILON && payments.length > 0;
  const needsRef = METHODS_NEEDING_REF.has(formMethod);
  const isCash = formMethod === 'CASH';
  const isCharge = formMethod === 'CHARGE';
  const splitMode = paymentFlowMode === 'split';
  const hasChargePayment = payments.some(p => p.method === 'CHARGE');
  const chargePaymentAmount = useMemo(
    () => payments
      .filter(p => p.method === 'CHARGE')
      .reduce((sum, p) => sum + p.amount, 0),
    [payments],
  );
  const isCreditLimitError = lastApiError?.status === 409
    && lastApiError.body?.code === 'CREDIT_LIMIT_EXCEEDED';
  const apiErrorMessage = String(lastApiError?.body?.error ?? lastApiError?.message ?? '');
  const isManagerAuthorizationError = lastApiError?.status === 400
    && apiErrorMessage.includes('Invalid manager authorization');
  const creditOverrideAction = useMemo(() => {
    if (!accountCreditCheck?.requiresOverride) {
      return 'Approve charge-to-account over the customer credit limit';
    }

    return [
      `Approve ${fmtPHP(parseFloat(accountCreditCheck.chargeAmount))} charge to account.`,
      `New balance ${fmtPHP(parseFloat(accountCreditCheck.newBalance))}`,
      `exceeds limit by ${fmtPHP(parseFloat(accountCreditCheck.overage))}.`,
    ].join(' ');
  }, [accountCreditCheck]);

  const parsedCashTendered = parseFloat(formCashTendered) || 0;

  // For CASH: payment amount = min(tendered, remaining)
  // For non-cash: payment amount = explicit amount field (or remaining)
  const defaultAmount = useMemo(() => {
    return remaining > 0 ? remaining.toFixed(2) : '';
  }, [remaining]);

  const parsedAmount = isCash
    ? Math.min(parsedCashTendered, remaining > 0 ? remaining : parsedCashTendered)
    : parseFloat(formAmount || defaultAmount) || 0;
  const nonCashOverpay = !isCash && parsedAmount > remaining + MONEY_EPSILON;

  // Cash change — real-time as the cashier enters tendered
  const cashChange = isCash && parsedCashTendered > remaining && remaining > MONEY_EPSILON
    ? parsedCashTendered - remaining
    : 0;
  const paymentProgressRatio = grandTotal > MONEY_EPSILON
    ? Math.min(1, Math.max(0, paidTotal / grandTotal))
    : 0;
  const paymentGuidance = useMemo(() => {
    if (isFullyPaid) return 'Ready to complete the sale.';
    if (splitMode) return 'Add each tender as a separate payment until the balance reaches zero.';
    if (isCharge) return customerId ? 'Charge the remaining balance to the selected customer account.' : 'Add a customer before charging this sale.';
    if (isCash) return 'Enter cash tendered, then complete the sale or add it as one split tender.';
    if (needsRef) return 'Reference or approval number is required before adding this payment.';
    return 'Enter the payment amount to continue.';
  }, [customerId, isCash, isCharge, isFullyPaid, needsRef, splitMode]);
  const cashTenderOptions = useMemo(
    () => buildCashTenderOptions(remaining, grandTotal),
    [grandTotal, remaining],
  );
  const activeMethodLabel = isCharge ? 'Charge' : methodLabel(formMethod);
  const displayError = error ? formatPosError(error, 'Checkout failed') : null;

  // Can the cashier add a payment right now?
  const canAddPayment = isCash
    ? parsedCashTendered > 0
    : parsedAmount > 0 && !nonCashOverpay;

  // Single payment covers entire remaining? Skip Add Payment → go straight to Complete
  const singlePaymentCoversAll = !splitMode && payments.length === 0 && (
    (isCash && parsedCashTendered >= remaining && parsedCashTendered > 0) ||
    (!isCash && !nonCashOverpay && parsedAmount >= remaining - MONEY_EPSILON && parsedAmount > 0)
  );

  const receiptMissing = !receiptNumber.trim();
  const paymentPreflight = useMemo(() => buildPaymentActionPreflight({
    registerLocked: isRegisterLocked,
    receiptMissing,
    isProcessing,
    isFullyPaid,
    remaining,
    isCash,
    cashTendered: parsedCashTendered,
    parsedAmount,
    nonCashOverpay,
    needsReference: needsRef,
    hasReference: !!formReference.trim(),
    customerRequired: isCharge,
    hasCustomer: !!customerId,
  }), [
    customerId,
    formReference,
    isCash,
    isCharge,
    isFullyPaid,
    isProcessing,
    isRegisterLocked,
    needsRef,
    nonCashOverpay,
    parsedAmount,
    parsedCashTendered,
    receiptMissing,
    remaining,
  ]);
  const paymentActionBlocked = paymentPreflight.blockingIssues.length > 0;
  const paymentPreflightColor = paymentPreflight.ready
    ? colors.status.success
    : paymentPreflight.requiresApproval
      ? colors.status.warning
      : colors.status.danger;

  // ── Auto-checkout after single payment covers all ──
  const [pendingAutoCheckout, setPendingAutoCheckout] = useState(false);

  // Note: handleCheckout is defined below via useCallback. React evaluates all hooks
  // in order on each render, so the ref is stable by the time the effect runs.
  const autoCheckoutRef = useRef<(() => void) | undefined>(undefined);
  const checkoutInFlightRef = useRef(false);
  const paymentActionLockedRef = useRef(false);

  // ── Undo state for Clear ──
  const [undoAmount, setUndoAmount] = useState<number | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = useCallback(() => {
    setFormAmount('');
    setFormCashTendered('');
    setFormReference('');
    setFormInstallment('STRAIGHT');
  }, []);

  useEffect(() => {
    if (payments.length > 0) return;
    setPaymentFlowMode(initialMethod === 'SPLIT' ? 'split' : 'single');

    if (initialMethod === 'CHARGE' && customerId) {
      setFormMethod('CHARGE');
      setFormAmount(remaining > 0 ? remaining.toFixed(2) : '');
      return;
    }

    setFormMethod('CASH');
    setFormAmount('');
    setFormCashTendered('');
  }, [customerId, initialMethod, payments.length, remaining]);

  useEffect(() => {
    if (payments.length > 1) {
      setPaymentFlowMode('split');
    }
  }, [payments.length]);

  useEffect(() => {
    if (isManagerAuthorizationError && hasChargePayment) {
      setAccountOverride(null);
      setCreditOverrideVisible(true);
      return;
    }
    if (isCreditLimitError && hasChargePayment && !accountOverride) {
      setCreditOverrideVisible(true);
    }
  }, [accountOverride, hasChargePayment, isCreditLimitError, isManagerAuthorizationError]);

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
      if (nonCashOverpay) {
        Alert.alert('Amount Too High', 'Non-cash payments cannot exceed the remaining balance.');
        return;
      }
    }
    if (needsRef && !formReference.trim()) {
      Alert.alert('Reference Required', 'Please enter a reference / approval number.');
      return;
    }
    if (paymentActionLockedRef.current) return;
    paymentActionLockedRef.current = true;

    addPayment({
      method: formMethod,
      amount: parsedAmount,
      cashTendered: isCash ? parsedCashTendered : undefined,
      reference: formReference.trim(),
      installmentTerm: formMethod === 'CREDIT_CARD' ? formInstallment : 'STRAIGHT',
    });
    if (parsedAmount < remaining - MONEY_EPSILON) {
      setPaymentFlowMode('split');
    }

    // Reset form for next payment
    resetForm();
    setTimeout(() => {
      paymentActionLockedRef.current = false;
    }, 250);
  }, [receiptMissing, isCash, parsedAmount, parsedCashTendered, nonCashOverpay, needsRef, formReference, formMethod, formInstallment, remaining, addPayment, resetForm]);

  // ── Single payment complete (skip Add Payment step) ──
  const handleSinglePaymentComplete = useCallback(() => {
    if (receiptMissing) {
      Alert.alert('Receipt Required', 'Please enter the receipt number.');
      return;
    }
    if (isCash && parsedCashTendered <= 0) return;
    if (!isCash && parsedAmount <= 0) return;
    if (nonCashOverpay) {
      Alert.alert('Amount Too High', 'Non-cash payments cannot exceed the remaining balance.');
      return;
    }
    if (needsRef && !formReference.trim()) {
      Alert.alert('Reference Required', 'Please enter a reference / approval number.');
      return;
    }
    if (paymentActionLockedRef.current) return;
    paymentActionLockedRef.current = true;

    // Add the payment first, then auto-checkout via useEffect
    addPayment({
      method: formMethod,
      amount: parsedAmount,
      cashTendered: isCash ? parsedCashTendered : undefined,
      reference: formReference.trim(),
      installmentTerm: formMethod === 'CREDIT_CARD' ? formInstallment : 'STRAIGHT',
    });
    resetForm();
    setPendingAutoCheckout(true);
    setTimeout(() => {
      paymentActionLockedRef.current = false;
    }, 250);
  }, [receiptMissing, isCash, parsedCashTendered, parsedAmount, nonCashOverpay, needsRef, formReference, formMethod, formInstallment, addPayment, resetForm]);

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
  const setTenderedAmount = useCallback((amount: number) => {
    setFormCashTendered(amount.toFixed(2));
    flashTenderedInput();
  }, [flashTenderedInput]);

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
  const buildReceiptData = useCallback((
    receiptLabel: string,
    footerMessage = 'Thank you for your purchase!',
  ): ReceiptData => {
    const location = locations.find(l => l.id === locationId);
    const primaryPayment = payments[0];
    const primaryMethod = receiptPaymentLabel(primaryPayment?.method || 'CASH');
    const cashTendered = getCashTendered(payments);
    const cashChange = getCashChange(payments);

    return {
      header: {
        storeName: location?.name || 'CBROS GENUINE AUTOPARTS',
        address: location?.address || undefined,
      },
      transaction: {
        receiptNumber: receiptLabel,
        date: new Date().toLocaleString(),
        cashier: user?.fullName || 'Cashier',
        lines: lines.map(l => ({
          name: l.name,
          qty: l.quantity,
          unitPrice: l.overridePrice ?? l.unitPrice,
          total: l.lineTotal,
        })),
        subtotal,
        discount,
        grandTotal,
        paymentMethod: payments.length > 1 ? 'SPLIT' : primaryMethod,
        cashTendered: cashTendered > 0 ? cashTendered : undefined,
        change: cashChange > 0 ? cashChange : undefined,
        payments: payments.map(p => ({
          method: receiptPaymentLabel(p.method),
          amount: p.amount,
          reference: p.reference || undefined,
          installmentTerm: p.method === 'CREDIT_CARD' && p.installmentTerm !== 'STRAIGHT' ? p.installmentTerm : undefined,
        })),
      },
      footer: { message: footerMessage },
    };
  }, [locations, locationId, payments, lines, subtotal, discount, grandTotal, user]);

  const ensureAccountChargeApproved = useCallback(async (
    overrideApproval?: CheckoutOverrideApproval,
  ): Promise<boolean> => {
    if (!hasChargePayment || overrideApproval || accountOverride) return true;
    if (!customerId) {
      Alert.alert('Customer Required', 'Charge payments require a customer on the order.');
      return false;
    }
    if (chargePaymentAmount <= MONEY_EPSILON) return true;

    try {
      const check = await apiFetch<AccountCreditCheckResult>(
        `/customers/${encodeURIComponent(customerId)}/credit-check`,
        {
          method: 'POST',
          body: JSON.stringify({ amount: chargePaymentAmount.toFixed(2) }),
        },
      );
      setAccountCreditCheck(check);
      if (check.requiresOverride) {
        setCreditOverrideVisible(true);
        return false;
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        return true;
      }
      Alert.alert(
        'Account Check Failed',
        formatPosError(err, 'Unable to verify this customer account.'),
      );
      return false;
    }
  }, [accountOverride, chargePaymentAmount, customerId, hasChargePayment]);

  // ── Checkout ──
  const runCheckout = useCallback(async (overrideApproval?: CheckoutOverrideApproval) => {
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    const MAX_RETRIES = 3;
    try {
      const accountApproved = await ensureAccountChargeApproved(overrideApproval);
      if (!accountApproved) return;
      setReceiptPrintState('idle');
      setDrawerCommandState('idle');

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const res = await checkout({
          allowNegativeStock: allowNegativeStock || undefined,
          overrideApproval,
        });
        if (res) {
          void queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
          if (res.saleId) {
            void queryClient.invalidateQueries({ queryKey: ['sales', 'detail', res.saleId] });
          }
          const receiptData = buildReceiptData(res.receiptNumber || res.saleNo);
          setCompletedReceiptData(receiptData);
          setCompletedChange(getCashChange(payments));
          const printResult = await printReceiptSafely(printer, receiptData, {
            type: 'receipt',
            title: `Receipt ${res.receiptNumber || res.saleNo}`,
            sourceId: res.saleId,
          }).catch(() => ({ success: false, error: 'Print failed' }));
          setReceiptPrintState(printResult.success ? 'printed' : 'failed');
          if (hasCashPayment(payments)) {
            try {
              await printer.openCashDrawer();
              setDrawerCommandState('sent');
            } catch {
              setDrawerCommandState('failed');
            }
          } else {
            setDrawerCommandState('skipped');
          }
          if (!printResult.success) {
            Alert.alert(
              'Print Notice',
              printResult.error || 'Receipt could not be printed.',
              [
                { text: 'View Receipt', onPress: () => setReceiptModalVisible(true) },
                { text: 'OK', style: 'cancel' },
              ],
            );
          }
          setAccountOverride(null);
          setAccountCreditCheck(null);
          clear();
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
    } finally {
      checkoutInFlightRef.current = false;
    }
  }, [checkout, allowNegativeStock, buildReceiptData, printer, payments, status, error, setReceiptNumber, reset, ensureAccountChargeApproved, queryClient, clear]);

  const handleCheckout = useCallback(() => {
    void runCheckout(accountOverride ?? undefined);
  }, [accountOverride, runCheckout]);

  const handleCreditOverrideApprove = useCallback((
    approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    if (!approval?.credential) {
      Alert.alert('Authorization Needed', 'Please enter a manager PIN, scan a barcode, or swipe a card.');
      return;
    }
    const override: AccountOverrideState = {
      approverName,
      credential: approval.credential,
      method: approval.method,
      pin: approval.method === 'pin' ? approval.credential : undefined,
    };
    setAccountOverride(override);
    setCreditOverrideVisible(false);
    reset();
    void runCheckout(override);
  }, [reset, runCheckout]);

  const handleCreditOverrideCancel = useCallback(() => {
    setCreditOverrideVisible(false);
    setAccountOverride(null);
    setAccountCreditCheck(null);
  }, []);

  // Keep ref in sync for auto-checkout effect
  autoCheckoutRef.current = handleCheckout;

  useEffect(() => {
    if (pendingAutoCheckout && isFullyPaid && !isProcessing) {
      setPendingAutoCheckout(false);
      autoCheckoutRef.current?.();
    }
  }, [pendingAutoCheckout, isFullyPaid, isProcessing]);

  const handlePrintReceipt = useCallback(async () => {
    if (!result || receiptPrinting) return;
    const receiptData = completedReceiptData ?? buildReceiptData(result.receiptNumber || result.saleNo);
    setReceiptPrinting(true);
    try {
      const printResult = await printReceiptSafely(printer, receiptData, {
        type: 'receipt',
        title: `Receipt ${result.receiptNumber || result.saleNo}`,
        sourceId: result.saleId,
      }).catch(() => ({ success: false, error: 'Print failed' }));
      setReceiptPrintState(printResult.success ? 'printed' : 'failed');
      if (!printResult.success) {
        Alert.alert(
          'Print Notice',
          printResult.error || 'Receipt could not be printed.',
          [
            { text: 'View Receipt', onPress: () => setReceiptModalVisible(true) },
            { text: 'OK', style: 'cancel' },
          ],
        );
      }
    } finally {
      setReceiptPrinting(false);
    }
  }, [result, receiptPrinting, completedReceiptData, buildReceiptData, printer]);

  const handleNewSale = useCallback(() => {
    setReceiptModalVisible(false);
    clear();
    reset();
    setAccountOverride(null);
    setAccountCreditCheck(null);
    setCompletedReceiptData(null);
    setCompletedChange(0);
    setReceiptPrintState('idle');
    setDrawerCommandState('idle');
    if (onBack) onBack();
    else navigation.navigate('Catalog' as never);
  }, [clear, reset, onBack, navigation]);

  const handleViewTransactions = useCallback(() => {
    setReceiptModalVisible(false);
    clear();
    void queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
    navigation.dispatch(CommonActions.navigate({
      name: 'More',
      params: { screen: 'Transactions' },
    }));
  }, [clear, navigation, queryClient]);

  const s = styles;

  /* ── Success state ── */
  if (status === 'success' && result) {
    const totalChange = completedChange;
    const receiptData = completedReceiptData ?? buildReceiptData(result.receiptNumber || result.saleNo);
    const receiptStepTone = receiptPrintState === 'printed'
      ? 'success'
      : receiptPrintState === 'failed'
        ? 'warning'
        : 'neutral';
    const receiptStepDetail = receiptPrintState === 'printed'
      ? 'Printed successfully'
      : receiptPrintState === 'failed'
        ? 'Print failed; receipt preview is available'
        : 'Ready to print or preview';
    const drawerStepDetail = drawerCommandState === 'sent'
      ? 'Drawer command sent'
      : drawerCommandState === 'failed'
        ? 'Drawer did not respond'
        : 'No cash drawer needed';
    const drawerStepTone = drawerCommandState === 'failed' ? 'warning' : 'success';
    return (
      <>
        <SafeAreaView style={s.container}>
          <View style={s.successContainer}>
            <View style={s.successIcon}>
              <Icon name="check" size={46} color={colors.status.success} strokeWidth={2.8} />
            </View>
            <Text style={s.successTitle}>Sale Complete</Text>
            <Text style={s.successReceipt}>{result.receiptNumber || result.saleNo}</Text>
            <Text style={s.successTotal}>{fmtPHP(parseFloat(result.grandTotal))}</Text>
            {totalChange > 0 && (
              <Text style={s.successChange}>Change: {fmtPHP(totalChange)}</Text>
            )}
            <View style={s.afterSalePanel}>
              <View style={s.afterSaleStep}>
                <View style={[s.afterSaleIcon, s.afterSaleIconSuccess]}>
                  <Icon name="check" size={17} color={colors.status.success} />
                </View>
                <View style={s.afterSaleCopy}>
                  <Text style={s.afterSaleLabel}>Sale posted</Text>
                  <Text style={s.afterSaleDetail}>{result.saleNo || result.saleId} is ready in transaction history</Text>
                </View>
              </View>
              <View style={s.afterSaleStep}>
                <View style={[
                  s.afterSaleIcon,
                  receiptStepTone === 'success' ? s.afterSaleIconSuccess : receiptStepTone === 'warning' ? s.afterSaleIconWarning : s.afterSaleIconNeutral,
                ]}>
                  <Icon
                    name="receipt"
                    size={17}
                    color={receiptStepTone === 'success' ? colors.status.success : receiptStepTone === 'warning' ? colors.status.warning : colors.text.muted}
                  />
                </View>
                <View style={s.afterSaleCopy}>
                  <Text style={s.afterSaleLabel}>Receipt</Text>
                  <Text style={s.afterSaleDetail}>{receiptStepDetail}</Text>
                </View>
              </View>
              <View style={s.afterSaleStep}>
                <View style={[
                  s.afterSaleIcon,
                  drawerStepTone === 'warning' ? s.afterSaleIconWarning : s.afterSaleIconSuccess,
                ]}>
                  <Icon
                    name="cash"
                    size={17}
                    color={drawerStepTone === 'warning' ? colors.status.warning : colors.status.success}
                  />
                </View>
                <View style={s.afterSaleCopy}>
                  <Text style={s.afterSaleLabel}>Cash drawer</Text>
                  <Text style={s.afterSaleDetail}>{drawerStepDetail}</Text>
                </View>
              </View>
              <View style={s.afterSaleStep}>
                <View style={[s.afterSaleIcon, s.afterSaleIconSuccess]}>
                  <Icon name="cart" size={17} color={colors.status.success} />
                </View>
                <View style={s.afterSaleCopy}>
                  <Text style={s.afterSaleLabel}>Register</Text>
                  <Text style={s.afterSaleDetail}>Active cart cleared for the next sale</Text>
                </View>
              </View>
            </View>
            <View style={s.successActions}>
              <Button
                title={receiptPrinting ? 'Printing...' : 'Print Receipt'}
                variant="secondary"
                fullWidth
                onPress={handlePrintReceipt}
                loading={receiptPrinting}
                disabled={receiptPrinting}
              />
              <Button
                title="View Receipt"
                variant="secondary"
                fullWidth
                onPress={() => setReceiptModalVisible(true)}
                style={{ marginTop: 8 }}
              />
              <Button
                title="View Transactions"
                variant="secondary"
                fullWidth
                onPress={handleViewTransactions}
                style={{ marginTop: 8 }}
              />
              <Button title="New Sale" variant="primary" fullWidth onPress={handleNewSale} style={{ marginTop: 8 }} />
            </View>
          </View>
        </SafeAreaView>
        <ReceiptDataPreviewModal
          visible={receiptModalVisible}
          receipt={receiptData}
          onClose={() => setReceiptModalVisible(false)}
          onPrint={handlePrintReceipt}
          printing={receiptPrinting}
        />
      </>
    );
  }

  /* ── Pending offline state ── */
  if (status === 'pending_offline') {
    const pendingCount = getPendingSales().length;
    const pendingReceiptData = buildReceiptData(
      receiptNumber.trim() || 'PENDING',
      'PENDING SYNC - VERIFY BEFORE RELEASE',
    );
    return (
      <>
        <SafeAreaView style={s.container}>
          <View style={s.successContainer}>
            <View style={s.pendingIcon}>
              <Icon name="sync" size={42} color={colors.status.warning} strokeWidth={2.6} />
            </View>
            <Text style={s.pendingTitle}>Sale Saved Offline</Text>
            <Text style={s.pendingText}>
              Sale saved locally. It will sync when back online.
            </Text>
            {pendingCount > 0 && (
              <Text style={s.pendingCount}>
                {pendingCount} pending sale{pendingCount !== 1 ? 's' : ''} queued
              </Text>
            )}
            <View style={s.successActions}>
              <Button
                title="View Pending Slip"
                variant="secondary"
                fullWidth
                onPress={() => setReceiptModalVisible(true)}
              />
              <Button title="New Sale" variant="primary" fullWidth onPress={handleNewSale} style={{ marginTop: 8 }} />
            </View>
          </View>
        </SafeAreaView>
        <ReceiptDataPreviewModal
          visible={receiptModalVisible}
          receipt={pendingReceiptData}
          onClose={() => setReceiptModalVisible(false)}
          statusLabel="Pending sync"
        />
      </>
    );
  }

  /* ════════════════════════════════════════════════ */
  /*  MAIN PAYMENT FORM — NO SCROLL LAYOUT           */
  /* ════════════════════════════════════════════════ */
  return (
    <SafeAreaView
      style={s.container}
      testID="payment-screen"
      accessibilityLabel="Payment screen"
    >
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
        <View style={s.workflowPanel}>
          <View style={s.workflowHeader}>
            <View style={s.workflowTitleRow}>
              <Icon
                name={splitMode ? 'card' : 'cash'}
                size={18}
                color={splitMode ? colors.accent.primary : colors.status.success}
              />
              <Text style={s.workflowTitle}>
                {splitMode ? 'Split tender' : 'Quick payment'}
              </Text>
              <View style={s.activeMethodPill}>
                <Text style={s.activeMethodText}>{activeMethodLabel}</Text>
              </View>
            </View>
            <View style={s.modeToggle}>
              <Pressable
                style={[s.modeToggleBtn, !splitMode && s.modeToggleBtnActive]}
                onPress={() => setPaymentFlowMode('single')}
                disabled={payments.length > 1}
              >
                <Text style={[s.modeToggleText, !splitMode && s.modeToggleTextActive]}>
                  Quick
                </Text>
              </Pressable>
              <Pressable
                style={[s.modeToggleBtn, splitMode && s.modeToggleBtnActive]}
                onPress={() => setPaymentFlowMode('split')}
              >
                <Text style={[s.modeToggleText, splitMode && s.modeToggleTextActive]}>
                  Split
                </Text>
              </Pressable>
            </View>
          </View>
          <Text style={s.workflowHint}>{paymentGuidance}</Text>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${paymentProgressRatio * 100}%` as any }]} />
          </View>
          <View style={s.workflowBalanceRow}>
            <Text style={s.workflowBalanceText}>Paid {fmtPHP(paidTotal)}</Text>
            <Text style={[
              s.workflowBalanceText,
              isFullyPaid ? s.workflowReadyText : s.workflowDueText,
            ]}>
              {isFullyPaid
                ? getCashChange(payments) > 0
                  ? `Change ${fmtPHP(getCashChange(payments))}`
                  : 'Ready to complete'
                : `Remaining ${fmtPHP(remaining)}`}
            </Text>
          </View>
        </View>

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
              {remaining > 0 ? (
                <Text style={s.appliedRemainingLabel}>Remaining: {fmtPHP(remaining)}</Text>
              ) : (
                <Text style={s.appliedFullyPaidLabel}>Fully Paid</Text>
              )}
            </View>
          </View>
        )}

        {/* ── 3. Payment Method Selector (grid) ── */}
        {!isFullyPaid && (
          <View style={s.methodsSection}>
            <View style={s.methodsGrid}>
              {STANDARD_METHODS.map(m => {
                const active = formMethod === m.key;
                return (
                  <Pressable
                    key={m.key}
                    style={[s.methodBtn, isTablet && s.methodBtnTablet, active && s.methodBtnActive]}
                    onPress={() => {
                      setFormMethod(m.key);
                      if (m.key !== 'CASH') {
                        setFormAmount(remaining > 0 ? remaining.toFixed(2) : '');
                      } else {
                        setFormAmount('');
                      }
                    }}
                    android_ripple={{ color: colors.accent.glow }}
                  >
                    <Icon
                      name={m.icon}
                      size={20}
                      color={active ? colors.accent.primary : colors.text.muted}
                    />
                    <Text style={[s.methodBtnText, isTablet && s.methodBtnTextTablet, active && s.methodBtnTextActive]}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Charge — visually distinct */}
              <Pressable
                style={[
                  s.chargeMethodBtn,
                  isTablet && s.chargeMethodBtnTablet,
                  isCharge && s.chargeMethodBtnActive,
                  !customerId && s.chargeMethodBtnDisabled,
                ]}
                onPress={handleChargeSelect}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Icon
                  name="receipt"
                  size={20}
                  color={isCharge ? colors.text.primary : colors.status.warning}
                />
                <Text style={[s.chargeMethodText, isTablet && s.methodBtnTextTablet, isCharge && s.chargeMethodTextActive]}>
                  Charge
                </Text>
              </Pressable>
            </View>
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
              {accountCreditCheck?.requiresOverride ? (
                <Text style={s.chargeApprovalText}>
                  Over limit by {fmtPHP(parseFloat(accountCreditCheck.overage))}; manager approval required
                </Text>
              ) : null}
              {accountOverride ? (
                <Text style={s.chargeApprovalText}>
                  Approved by {accountOverride.approverName} via {accountOverride.method}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ── 5. Quick Amount Buttons (CASH only) ── */}
        {!isFullyPaid && isCash && (
          <View style={s.quickRow}>
            {cashTenderOptions.map(option => (
              <Pressable
                key={`${option.label}-${option.amount}`}
                style={option.exact ? s.quickBtnExact : s.quickBtnLg}
                onPress={() => setTenderedAmount(option.amount)}
              >
                <Text style={option.exact ? s.quickBtnExactText : s.quickBtnText}>
                  {option.label}
                </Text>
                {!option.exact && (
                  <Text style={s.quickBtnAmount}>{fmtPHP(option.amount)}</Text>
                )}
              </Pressable>
            ))}
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
        {displayError && <Text style={s.errorText}>{displayError}</Text>}

        {/* ── 6. Action Button — pinned at bottom ── */}
        <View style={[
          s.preflightPanel,
          paymentPreflight.ready && s.preflightPanelReady,
          paymentActionBlocked && s.preflightPanelBlocked,
        ]}>
          <View style={s.preflightHeader}>
            <Icon
              name={paymentPreflight.ready ? 'check' : 'alert'}
              size={18}
              color={paymentPreflightColor}
            />
            <View style={s.preflightCopy}>
              <Text style={s.preflightTitle}>{paymentPreflight.title}</Text>
              <Text style={s.preflightDetail}>{paymentPreflight.detail}</Text>
            </View>
          </View>
          {paymentPreflight.issues.length > 0 && (
            <View style={s.preflightIssueList}>
              {paymentPreflight.issues.map(issue => (
                <View key={issue.code} style={s.preflightIssueRow}>
                  <View style={[
                    s.preflightIssueDot,
                    issue.severity === 'blocking'
                      ? s.preflightIssueDotDanger
                      : s.preflightIssueDotWarning,
                  ]} />
                  <View style={s.preflightIssueCopy}>
                    <Text style={s.preflightIssueLabel}>{issue.label}</Text>
                    <Text style={s.preflightIssueText}>{issue.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={s.actionSection}>
          {isFullyPaid ? (
            /* Fully paid via split payments → Complete Sale */
            <Pressable
              style={[s.completeSaleBtn, paymentActionBlocked && { opacity: 0.5 }]}
              onPress={handleCheckout}
              disabled={paymentActionBlocked}
            >
              <Text style={s.completeSaleBtnText}>
                {isProcessing ? 'Processing...' : (
                  getCashChange(payments) > 0
                    ? `COMPLETE SALE · Change: ${fmtPHP(getCashChange(payments))}`
                    : 'COMPLETE SALE'
                )}
              </Text>
            </Pressable>
          ) : singlePaymentCoversAll ? (
            /* Single payment covers everything → Complete Sale shortcut */
            <Pressable
              style={[s.completeSaleBtn, paymentActionBlocked && { opacity: 0.5 }]}
              onPress={() => {
                handleSinglePaymentComplete();
              }}
              disabled={paymentActionBlocked}
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
                  paymentActionBlocked && s.addPaymentBtnDisabled,
                ]}
                onPress={handleAddPayment}
                disabled={paymentActionBlocked}
              >
                <Text style={[
                  s.addPaymentBtnText,
                  paymentActionBlocked && s.addPaymentBtnTextDisabled,
                ]}>
                  {canAddPayment
                    ? `${splitMode && payments.length === 0 ? 'ADD FIRST PAYMENT' : 'ADD PAYMENT'} · ${fmtPHP(parsedAmount)}`
                    : 'ADD PAYMENT'}
                </Text>
              </Pressable>
              {paymentActionBlocked && paymentPreflight.primaryIssue && (
                <Text style={s.remainingHint}>
                  {paymentPreflight.primaryIssue.detail}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
      <ManagerPinModal
        visible={creditOverrideVisible}
        action={creditOverrideAction}
        requiredLevel={2}
        onApprove={handleCreditOverrideApprove}
        onCancel={handleCreditOverrideCancel}
      />
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
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg.surface,
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
  workflowPanel: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
    gap: 6,
  },
  workflowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  workflowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  workflowTitle: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  activeMethodPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeMethodText: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: radius.md,
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden' as any,
  },
  modeToggleBtn: {
    minWidth: 58,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  modeToggleBtnActive: {
    backgroundColor: colors.accent.primary,
  },
  modeToggleText: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  modeToggleTextActive: {
    color: colors.text.inverse,
  },
  workflowHint: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border.subtle,
    overflow: 'hidden' as any,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.status.success,
  },
  workflowBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workflowBalanceText: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  workflowDueText: {
    color: colors.status.warning,
  },
  workflowReadyText: {
    color: colors.status.success,
  },

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
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.status.warning,
  },
  appliedFullyPaidLabel: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.status.success,
  },

  /* ── 3. Payment Methods (grid) ── */
  methodsSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  methodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  methodBtn: {
    width: '48%' as any,
    flexGrow: 1,
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
    overflow: 'hidden' as any,
  },
  methodBtnTablet: {
    width: '23%' as any,
    minHeight: 58,
    paddingVertical: spacing.sm,
  },
  methodBtnActive: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.primary,
  },
  methodBtnText: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  methodBtnTextTablet: {
    fontSize: fontSize.sm,
  },
  methodBtnTextActive: {
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
  },
  chargeMethodBtn: {
    width: '48%' as any,
    flexGrow: 1,
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.warning,
    borderStyle: 'dashed' as any,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    overflow: 'hidden' as any,
  },
  chargeMethodBtnTablet: {
    width: '23%' as any,
    minHeight: 58,
    paddingVertical: spacing.sm,
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
    fontSize: fontSize.base,
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
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    height: 64,
  },
  tenderedInputRowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingHorizontal: spacing.lg,
    height: 64,
  },
  tenderedCurrency: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['4xl'],
    color: colors.text.muted,
    marginRight: spacing.sm,
  },
  tenderedInput: {
    flex: 1,
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize['5xl'],
    color: colors.text.primary,
    padding: 0,
  },
  changeInline: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  changeLabel: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.status.success,
  },
  changeAmount: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize['3xl'],
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
    backgroundColor: colors.bg.input,
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
  chargeApprovalText: {
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    color: colors.status.successText,
    marginTop: 4,
  },

  /* ── 5. Quick Amount Buttons ── */
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  quickBtnLg: {
    flex: 1,
    minWidth: 104,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quickBtnSm: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quickBtnText: {
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.md,
    color: colors.text.secondary,
  },
  quickBtnAmount: {
    fontFamily: fonts.mono.medium,
    fontSize: fontSize.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  quickBtnExact: {
    flex: 1,
    minWidth: 92,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent.glow,
    borderWidth: 1.5,
    borderColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quickBtnExactText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.md,
    color: colors.accent.primary,
  },
  quickBtnClear: {
    width: 44,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.status.dangerBg,
    borderWidth: 1,
    borderColor: colors.status.danger,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quickBtnClearText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
    color: colors.status.danger,
  },

  /* ── Error ── */
  preflightPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  preflightPanelReady: {
    borderColor: colors.status.success,
    backgroundColor: colors.status.successBg,
  },
  preflightPanelBlocked: {
    borderColor: colors.status.danger,
    backgroundColor: colors.status.dangerBg,
  },
  preflightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  preflightCopy: {
    flex: 1,
  },
  preflightTitle: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  preflightDetail: {
    marginTop: 2,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  preflightIssueList: {
    gap: spacing.xs,
    paddingLeft: 26,
  },
  preflightIssueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  preflightIssueDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },
  preflightIssueDotDanger: {
    backgroundColor: colors.status.danger,
  },
  preflightIssueDotWarning: {
    backgroundColor: colors.status.warning,
  },
  preflightIssueCopy: {
    flex: 1,
  },
  preflightIssueLabel: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    color: colors.text.primary,
  },
  preflightIssueText: {
    marginTop: 1,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    color: colors.text.muted,
  },

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
    backgroundColor: colors.accent.primary,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  completeSaleBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    color: '#FFFFFF',
    letterSpacing: 0,
  },
  addPaymentBtn: {
    backgroundColor: colors.accent.primary,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPaymentBtnDisabled: {
    backgroundColor: colors.bg.overlay,
    opacity: 0.5,
  },
  addPaymentBtnText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    color: colors.text.inverse,
    letterSpacing: 0,
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
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.status.successBg,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: spacing.md,
  },
  afterSalePanel: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  afterSaleStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  afterSaleIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  afterSaleIconSuccess: {
    backgroundColor: colors.status.successBg,
  },
  afterSaleIconWarning: {
    backgroundColor: colors.status.warningBg,
  },
  afterSaleIconNeutral: {
    backgroundColor: colors.bg.elevated,
  },
  afterSaleCopy: {
    flex: 1,
  },
  afterSaleLabel: {
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  afterSaleDetail: {
    fontFamily: fonts.body.regular,
    fontSize: fontSize.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  successActions: {
    width: '100%',
    maxWidth: 520,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  pendingIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.status.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
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
