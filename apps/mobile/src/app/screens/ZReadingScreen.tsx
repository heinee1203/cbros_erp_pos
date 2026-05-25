import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useZReadingQuery, type ZReadingData } from '@/hooks/use-shift';
import { apiFetch } from '@/services/api-client';
import { queryClient } from '@/services/query-client';
import { colors, textStyles, spacing, layout, fonts, radius } from '@/theme';
import { usePrinter } from '@/hardware/printer/context';
import { buildZReadingReceipt } from '@/hardware/printer/z-reading-receipt';
import { printEscposRawSafely } from '@/hardware/printer/settings';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getPendingSales, onPendingSalesChanged } from '@/storage/pending-sales';
import { recordDrawerVariance } from '@/storage/drawer-variance-history';
import {
  getRegisterDrawerEventsForShift,
  getUnsyncedRegisterDrawerEventsForShift,
  onRegisterDrawerEventsChanged,
  summarizeRegisterDrawerEvents,
  type RegisterDrawerEvent,
  type RegisterDrawerSummary,
} from '@/storage/register-drawer-events';
import { reconcilePendingSales } from '@/hooks/use-checkout';
import { reconcileRegisterDrawerEvents } from '@/sync/register-drawer-sync';
import { formatApiDateTime } from '@/utils/datetime';
import { formatPosError } from '@/utils/pos-error-messages';
import { summarizePendingSales } from '@/utils/pending-sale-summary';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { PrintJobPreviewModal } from '@/components/PrintJobPreviewModal';
import type { PrintJob } from '@/storage/print-jobs';
import { Icon } from '@/components/ui';
import { useRequireElevation } from '@/hooks/use-require-elevation';

function toNumber(amount: string | number | null | undefined): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  return Number.isFinite(num) ? num : 0;
}

function fmtPHP(amount: string | number | null | undefined): string {
  const num = toNumber(amount);
  return `\u20B1${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtSignedPHP(amount: string | number | null | undefined): string {
  const num = toNumber(amount);
  return `${num >= 0 ? '+' : '-'}${fmtPHP(Math.abs(num))}`;
}

function fmtTime(dateStr: string | null): string {
  return formatApiDateTime(dateStr, { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dateStr: string | null): string {
  return formatApiDateTime(dateStr, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMethod(method: string): string {
  const map: Record<string, string> = {
    CASH: 'Cash',
    CREDIT_CARD: 'Credit Card',
    DEBIT_CARD: 'Debit Card',
    QRPH: 'QRPH',
    GCASH: 'GCash',
    MAYA: 'Maya',
    BANK_TRANSFER: 'Bank Transfer',
    ACCOUNT: 'Charge/Account',
    EFT: 'EFT',
    CARD: 'Card',
    OTHER: 'Other',
  };
  return map[method] || method;
}

function normalizeCashAmount(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [whole, ...decimalParts] = cleaned.split('.');
  if (decimalParts.length === 0) return whole;
  return `${whole}.${decimalParts.join('').slice(0, 2)}`;
}

function drawerActionLabel(type: RegisterDrawerEvent['type']): string {
  if (type === 'PAID_IN') return 'Paid In';
  if (type === 'PAID_OUT') return 'Paid Out';
  return 'No Sale';
}

function formatDrawerSummary(summary: RegisterDrawerSummary): string {
  if (summary.eventCount === 0) return 'No drawer events';
  return `${summary.paidInCount} paid in / ${summary.paidOutCount} paid out / ${summary.noSaleCount} no sale`;
}

function buildCloseoutNotes(
  baseNotes: string,
  drawerEvents: RegisterDrawerEvent[],
  drawerSummary: RegisterDrawerSummary,
): string | undefined {
  const lines = [baseNotes.trim()].filter(Boolean);

  if (drawerSummary.eventCount > 0) {
    lines.push(
      `POS drawer events: ${formatDrawerSummary(drawerSummary)}; paid in ${fmtPHP(drawerSummary.paidInTotal)}; paid out ${fmtPHP(drawerSummary.paidOutTotal)}; net ${fmtSignedPHP(drawerSummary.netCash)}.`,
    );
    drawerEvents.slice(0, 6).forEach(event => {
      lines.push(
        `${drawerActionLabel(event.type)} ${event.type === 'NO_SALE' ? '' : fmtPHP(event.amount)} at ${fmtTime(event.createdAt)} approved by ${event.approvedBy}${event.reason ? `: ${event.reason}` : ''}`.trim(),
      );
    });
  }

  const value = lines.join('\n').trim();
  return value ? value.slice(0, 1000) : undefined;
}

type ServerDrawerEvent = NonNullable<
  NonNullable<ReturnType<typeof useZReadingQuery>['data']>['accountability']['drawerEvents']
>[number];
type ReceiptDrawerEvent = NonNullable<ZReadingData['accountability']['drawerEvents']>[number];

function normalizeServerDrawerEvent(event: ServerDrawerEvent): RegisterDrawerEvent {
  return {
    id: event.clientEventId ?? event.id,
    serverId: event.id,
    type: event.type,
    amount: toNumber(event.amount),
    reason: event.reason,
    locationId: event.locationId,
    locationName: event.locationName,
    shiftId: event.shiftId,
    cashierId: event.cashierId,
    cashierName: event.cashierName,
    approvedBy: event.approvedBy,
    authorizationMethod: event.authorizationMethod,
    authorizationUserId: event.authorizationUserId ?? undefined,
    drawerOpened: event.drawerOpened,
    drawerError: event.drawerError ?? undefined,
    createdAt: event.createdAt,
    syncStatus: 'synced',
  };
}

function toReceiptDrawerEvent(event: RegisterDrawerEvent): ReceiptDrawerEvent {
  return {
    id: event.serverId ?? event.id,
    type: event.type,
    amount: event.amount.toFixed(2),
    reason: event.reason,
    locationId: event.locationId,
    locationName: event.locationName,
    shiftId: event.shiftId,
    cashierId: event.cashierId,
    cashierName: event.cashierName,
    approvedBy: event.approvedBy,
    authorizationMethod: event.authorizationMethod,
    authorizationUserId: event.authorizationUserId ?? null,
    drawerOpened: event.drawerOpened,
    drawerError: event.drawerError ?? null,
    clientEventId: event.id,
    createdAt: event.createdAt,
  };
}

function getPendingSaleCounts() {
  const pending = getPendingSales();
  const summary = summarizePendingSales(pending);
  const failed = pending.filter(sale => sale.status === 'failed').length;
  return {
    total: pending.length,
    retryable: pending.length - failed,
    failed,
    totalPayments: summary.totalPayments,
    oldestAgeLabel: summary.oldestAgeLabel,
  };
}

function getVarianceTone(amount: number | null): 'default' | 'success' | 'warning' | 'danger' {
  if (amount === null) return 'default';
  const abs = Math.abs(amount);
  if (abs < 1) return 'success';
  if (abs < 50) return 'warning';
  return 'danger';
}

export default function ZReadingScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { shiftId, mode } = route.params as { shiftId: string; mode: 'view' | 'close' | 'snapshot' };
  const isCloseMode = mode === 'close';
  const isSnapshotMode = mode === 'snapshot';

  const { data: zReading, isLoading, refetch } = useZReadingQuery(shiftId);
  const printer = usePrinter();
  const { guard: guardCloseShift, elevationProps: closeShiftElevationProps } = useRequireElevation();
  const [cashTendered, setCashTendered] = useState('');
  const [closing, setClosing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<'not_printed' | 'printed' | 'failed'>('not_printed');
  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null);
  const [reconcilingPending, setReconcilingPending] = useState(false);
  const [reconcilingDrawer, setReconcilingDrawer] = useState(false);
  const [drawerAuthorizationVisible, setDrawerAuthorizationVisible] = useState(false);
  const [pendingCounts, setPendingCounts] = useState(getPendingSaleCounts);
  const [localDrawerEvents, setLocalDrawerEvents] = useState(() => getRegisterDrawerEventsForShift(shiftId));
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [notes, setNotes] = useState('');

  const styles = createStyles();

  React.useEffect(() => onPendingSalesChanged(() => {
    setPendingCounts(getPendingSaleCounts());
  }), []);

  React.useEffect(() => onRegisterDrawerEventsChanged(() => {
    setLocalDrawerEvents(getRegisterDrawerEventsForShift(shiftId));
  }), [shiftId]);

  const parsedCashValue = parseFloat(cashTendered);
  const parsedCash = Number.isFinite(parsedCashValue) ? parsedCashValue : 0;
  const serverDrawerEvents = React.useMemo(
    () => (zReading?.accountability.drawerEvents ?? []).map(normalizeServerDrawerEvent),
    [zReading?.accountability.drawerEvents],
  );
  const unsyncedDrawerEvents = React.useMemo(
    () => getUnsyncedRegisterDrawerEventsForShift(shiftId),
    [shiftId, localDrawerEvents],
  );
  const drawerEvents = React.useMemo(
    () => [...unsyncedDrawerEvents, ...serverDrawerEvents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [serverDrawerEvents, unsyncedDrawerEvents],
  );
  const drawerSummary = React.useMemo(
    () => summarizeRegisterDrawerEvents(drawerEvents),
    [drawerEvents],
  );
  const unsyncedDrawerSummary = React.useMemo(
    () => summarizeRegisterDrawerEvents(unsyncedDrawerEvents),
    [unsyncedDrawerEvents],
  );
  const appliesLocalDrawerEvents = Boolean(zReading && !zReading.closedAt && !isSnapshotMode);
  const drawerExpectedAdjustment = appliesLocalDrawerEvents ? unsyncedDrawerSummary.netCash : 0;
  const drawerTotalNet = drawerSummary.netCash;
  const serverExpectedCash = toNumber(zReading?.cashReconciliation.expectedCash);
  const expectedCash = serverExpectedCash + drawerExpectedAdjustment;
  const variance = parsedCash - expectedCash;
  const storedVarianceValue = zReading?.cashReconciliation.variance == null
    ? null
    : toNumber(zReading.cashReconciliation.variance);

  const getVarianceColor = () => {
    if (!cashTendered) return colors.text.muted;
    const absVar = Math.abs(variance);
    if (absVar < 1) return colors.status.success;
    if (absVar < 50) return colors.status.warning;
    return colors.status.danger;
  };

  const handleReconcilePending = useCallback(async () => {
    setReconcilingPending(true);
    try {
      const summary = await reconcilePendingSales();
      const remaining = getPendingSaleCounts();
      setPendingCounts(remaining);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      await refetch();

      if (summary.blockedReason === 'store_lock') {
        Alert.alert(
          'Register Locked Store Required',
          formatPosError('Register this device to a store before processing pending sales.'),
        );
      } else if (remaining.total > 0) {
        Alert.alert(
          remaining.failed > 0 ? 'Manager Review Needed' : 'Pending Sales Remain',
          `${remaining.total} pending sale(s) still need attention before this shift can be closed.`,
        );
      } else {
        Alert.alert('Pending Sales Synced', 'The shift totals have been refreshed.');
      }
    } catch (err: any) {
      setPendingCounts(getPendingSaleCounts());
      Alert.alert('Reconciliation Failed', formatPosError(err, 'Unable to process pending sales.'));
    } finally {
      setReconcilingPending(false);
    }
  }, [refetch]);

  const refreshDrawerEvents = useCallback(async () => {
    setLocalDrawerEvents(getRegisterDrawerEventsForShift(shiftId));
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
    queryClient.invalidateQueries({ queryKey: ['shifts', 'z-reading', shiftId] });
    await refetch();
  }, [refetch, shiftId]);

  const handleDrawerSyncPress = useCallback(() => {
    const currentUnsynced = getUnsyncedRegisterDrawerEventsForShift(shiftId);
    setLocalDrawerEvents(getRegisterDrawerEventsForShift(shiftId));
    if (currentUnsynced.length === 0) {
      Alert.alert('Drawer Events Synced', 'No local drawer events are waiting for this shift.');
      return;
    }
    setDrawerAuthorizationVisible(true);
  }, [shiftId]);

  const handleDrawerAuthorization = useCallback(async (
    _approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    setDrawerAuthorizationVisible(false);
    if (!approval?.credential) {
      Alert.alert('Authorization Required', 'Manager approval was not captured.');
      return;
    }

    setReconcilingDrawer(true);
    try {
      const summary = await reconcileRegisterDrawerEvents({
        credential: approval.credential,
        method: approval.method,
      }, { shiftId });
      await refreshDrawerEvents();

      const remaining = getUnsyncedRegisterDrawerEventsForShift(shiftId);
      if (summary.blockedReason === 'store_lock') {
        Alert.alert(
          'Register Locked Store Required',
          formatPosError('Register this device to a store before syncing drawer events.'),
        );
      } else if (remaining.length > 0) {
        Alert.alert(
          summary.failed > 0 ? 'Manager Review Needed' : 'Drawer Events Still Pending',
          `${remaining.length} local drawer event(s) still need attention before this shift can close.`,
        );
      } else {
        Alert.alert('Drawer Events Synced', 'Drawer events are now recorded on the server.');
      }
    } catch (err: any) {
      setLocalDrawerEvents(getRegisterDrawerEventsForShift(shiftId));
      Alert.alert('Drawer Sync Failed', formatPosError(err, 'Unable to sync drawer events.'));
    } finally {
      setReconcilingDrawer(false);
    }
  }, [refreshDrawerEvents, shiftId]);

  const handleCloseShift = useCallback(async () => {
    const currentPending = getPendingSaleCounts();
    if (currentPending.total > 0) {
      setPendingCounts(currentPending);
      Alert.alert(
        currentPending.failed > 0 ? 'Manager Review Needed' : 'Pending Sales',
        `${currentPending.total} pending sale(s) must be cleared before this shift can close. This keeps the Z-reading from missing offline transactions.`,
        [
          { text: 'Cancel', style: 'cancel' },
          ...(currentPending.retryable > 0
            ? [{ text: 'Reconcile Now', onPress: handleReconcilePending }]
            : []),
        ],
      );
      return;
    }

    const currentUnsyncedDrawerEvents = getUnsyncedRegisterDrawerEventsForShift(shiftId);
    if (currentUnsyncedDrawerEvents.length > 0) {
      setLocalDrawerEvents(getRegisterDrawerEventsForShift(shiftId));
      Alert.alert(
        'Drawer Events Need Sync',
        `${currentUnsyncedDrawerEvents.length} local drawer event(s) must be recorded on the server before this shift can close. This keeps paid-in, paid-out, and no-sale audit records from being stranded on this tablet.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sync Now', onPress: handleDrawerSyncPress },
        ],
      );
      return;
    }

    if (!cashTendered.trim() || !Number.isFinite(parsedCashValue)) {
      Alert.alert('Required', 'Please enter the actual cash count.');
      return;
    }

    const refundCount = zReading?.accountability.refunds.length ?? 0;
    const voidCount = zReading?.accountability.voids.length ?? 0;
    const hasDrawerEvents = drawerSummary.eventCount > 0;
    const needsManagerReview = Math.abs(variance) >= 1 || refundCount > 0 || voidCount > 0 || hasDrawerEvents;
    const needsCloseoutNotes = Math.abs(variance) >= 50 || refundCount > 0 || voidCount > 0;

    if (needsManagerReview && !reviewAcknowledged) {
      Alert.alert(
        'Manager Review Required',
        'Review the closeout exceptions and acknowledge them before closing this shift.',
      );
      return;
    }

    if (needsCloseoutNotes && notes.trim().length < 3) {
      Alert.alert(
        'Closeout Notes Required',
        'Add a short note for the variance, refund, or void exception before closing this shift.',
      );
      return;
    }

    guardCloseShift('closeShift', 'Close shift and file Z-reading', () => {
      Alert.alert(
        'Close Shift',
        `Actual cash: ${fmtPHP(parsedCash)}\nExpected: ${fmtPHP(expectedCash)}\nVariance: ${fmtSignedPHP(variance)}\n\nAre you sure you want to close this shift?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close Shift',
            style: 'destructive',
            onPress: async () => {
              setClosing(true);
              try {
                const closeoutNotes = buildCloseoutNotes(notes, drawerEvents, drawerSummary);
                recordDrawerVariance({
                  shiftId,
                  expectedCash,
                  actualCash: parsedCash,
                  note: closeoutNotes,
                  cashier: zReading?.cashierName,
                });
                await apiFetch(`/shifts/${shiftId}/close`, {
                  method: 'POST',
                  requireLockedLocation: true,
                  body: JSON.stringify({
                    actualCash: parsedCash.toFixed(2),
                    expectedCashAdjustment: drawerExpectedAdjustment.toFixed(2),
                    notes: closeoutNotes,
                  }),
                });
                queryClient.invalidateQueries({ queryKey: ['shifts'] });
                queryClient.invalidateQueries({ queryKey: ['shifts', 'z-reading', shiftId] });
                queryClient.invalidateQueries({ queryKey: ['sales'] });
                Alert.alert('Shift Closed', 'Z-Reading saved successfully.', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              } catch (err: any) {
                Alert.alert('Close Shift Failed', formatPosError(err, 'Failed to close shift'));
              } finally {
                setClosing(false);
              }
            },
          },
        ],
      );
    });
  }, [
    cashTendered,
    parsedCash,
    parsedCashValue,
    expectedCash,
    variance,
    shiftId,
    notes,
    drawerEvents,
    drawerExpectedAdjustment,
    drawerSummary,
    handleDrawerSyncPress,
    navigation,
    handleReconcilePending,
    guardCloseShift,
    reviewAcknowledged,
    zReading?.cashierName,
    zReading?.accountability.refunds.length,
    zReading?.accountability.voids.length,
  ]);

  const buildZReadingPrintJob = useCallback((): PrintJob | null => {
    if (!zReading) return null;
    if (mode === 'close' && (!cashTendered.trim() || !Number.isFinite(parsedCashValue))) {
      Alert.alert('Required', 'Enter the actual cash count before printing the final Z-reading.');
      return null;
    }

    const paperWidth = (storage.getString(KEYS.PRINTER_PAPER_WIDTH) || '80mm') as '58mm' | '80mm';
    const printData = {
      ...zReading,
      cashReconciliation: {
        ...zReading.cashReconciliation,
        expectedCash: expectedCash.toFixed(2),
        actualCash: mode === 'close' ? parsedCash.toFixed(2) : zReading.cashReconciliation.actualCash,
        variance: mode === 'close' ? variance.toFixed(2) : zReading.cashReconciliation.variance,
      },
      accountability: {
        ...zReading.accountability,
        drawerEvents: drawerEvents.map(toReceiptDrawerEvent),
      },
    };
    const receiptData = buildZReadingReceipt(printData, mode === 'view' ? 'view' : 'close', paperWidth);
    const now = new Date().toISOString();
    return {
      id: `preview-${shiftId}`,
      type: 'z-reading',
      title: `${mode === 'view' ? 'X-Reading' : 'Z-Reading'} ${shiftId.slice(0, 8)}`,
      status: 'pending',
      payload: { rawBytes: Array.from(receiptData) },
      printerLanguage: 'escpos',
      attempts: 0,
      autoRetryCount: 0,
      lastAttemptReason: 'manual',
      nextRetryAt: now,
      sourceId: shiftId,
      createdAt: now,
      updatedAt: now,
    };
  }, [zReading, mode, cashTendered, parsedCashValue, expectedCash, parsedCash, variance, drawerEvents, shiftId]);

  const handlePreviewPrint = useCallback(() => {
    const job = buildZReadingPrintJob();
    if (job) setPreviewJob(job);
  }, [buildZReadingPrintJob]);

  const handlePrint = useCallback(async () => {
    const job = buildZReadingPrintJob();
    if (!job?.payload.rawBytes) return;

    setPrinting(true);
    try {
      const result = await printEscposRawSafely(printer, Uint8Array.from(job.payload.rawBytes), {
        type: 'z-reading',
        title: `Z-Reading ${shiftId.slice(0, 8)}`,
        sourceId: shiftId,
      });
      setPrintStatus(result.success ? 'printed' : 'failed');
      if (!result.success) {
        Alert.alert('Print Error', result.error || 'Failed to print');
      }
    } catch (err: any) {
      setPrintStatus('failed');
      Alert.alert('Print Error', err.message || 'Unexpected error');
    } finally {
      setPrinting(false);
    }
  }, [buildZReadingPrintJob, printer, shiftId]);

  if (isLoading || !zReading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading Z-Reading...</Text>
      </View>
    );
  }

  const openingFloat = toNumber(zReading.openingFloat);
  const totalVoidAmount = zReading.accountability.voids.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const totalRefundAmount = zReading.accountability.refunds.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const cashPaymentTotal = zReading.paymentBreakdown
    .filter(payment => payment.method === 'CASH')
    .reduce((sum, payment) => sum + toNumber(payment.total), 0);
  const nonCashTotal = zReading.paymentBreakdown
    .filter(payment => payment.method !== 'CASH')
    .reduce((sum, payment) => sum + toNumber(payment.total), 0);
  const tenderCount = zReading.paymentBreakdown.reduce((sum, payment) => sum + payment.count, 0);
  const reviewVariance = isCloseMode
    ? cashTendered ? variance : null
    : storedVarianceValue;
  const varianceTone = getVarianceTone(reviewVariance);
  const hasReviewVariance = reviewVariance !== null && Math.abs(reviewVariance) >= 1;
  const hasAuditExceptions =
    zReading.accountability.voids.length > 0 ||
    zReading.accountability.refunds.length > 0 ||
    drawerSummary.eventCount > 0 ||
    hasReviewVariance;
  const countedCashEntered = cashTendered.trim().length > 0 && Number.isFinite(parsedCashValue);
  const needsCloseoutNotes = isCloseMode && (
    (reviewVariance !== null && Math.abs(reviewVariance) >= 50) ||
    zReading.accountability.voids.length > 0 ||
    zReading.accountability.refunds.length > 0
  );
  const closeoutReady =
    pendingCounts.total === 0 &&
    unsyncedDrawerEvents.length === 0 &&
    countedCashEntered &&
    (!hasAuditExceptions || reviewAcknowledged) &&
    (!needsCloseoutNotes || notes.trim().length >= 3);
  const title = isCloseMode
    ? 'Z-READING / CLOSE SHIFT'
    : isSnapshotMode
      ? 'Z-READING / CLOSED SHIFT'
      : 'X-READING / SHIFT SUMMARY';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>
            {zReading.locationName} - {zReading.cashierName}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Shift Info */}
        <View style={styles.shiftMeta}>
          <Text style={styles.metaText}>
            Opened: {fmtDate(zReading.openedAt)} at {fmtTime(zReading.openedAt)}
          </Text>
          {zReading.closedAt && (
            <Text style={styles.metaText}>
              Closed: {fmtDate(zReading.closedAt)} at {fmtTime(zReading.closedAt)}
            </Text>
          )}
        </View>

        {isSnapshotMode && (
          <View style={styles.snapshotBanner}>
            <Text style={styles.snapshotTitle}>Frozen Z-reading snapshot</Text>
            <Text style={styles.snapshotText}>
              Reprint uses the saved closeout totals for audit review.
            </Text>
          </View>
        )}

        {isCloseMode && pendingCounts.total > 0 && (
          <View style={styles.pendingSyncCard}>
            <Text style={styles.pendingSyncTitle}>
              {pendingCounts.failed > 0 ? 'Pending sales need manager review' : 'Pending sales need sync'}
            </Text>
            <Text style={styles.pendingSyncText}>
              {pendingCounts.retryable > 0
                ? `${pendingCounts.retryable} offline sale(s) must be reconciled before closeout.`
                : `${pendingCounts.failed} sale(s) could not be reconciled automatically.`}
            </Text>
            <Text style={styles.pendingSyncMeta}>
              Oldest {pendingCounts.oldestAgeLabel} / {fmtPHP(pendingCounts.totalPayments)} queued
            </Text>
            {pendingCounts.retryable > 0 && (
              <Pressable
                style={[styles.pendingSyncButton, reconcilingPending && styles.btnDisabled]}
                android_ripple={{ color: colors.accent.glow }}
                onPress={handleReconcilePending}
                disabled={reconcilingPending}
              >
                {reconcilingPending ? (
                  <ActivityIndicator size="small" color={colors.accent.primary} />
                ) : (
                  <Text style={styles.pendingSyncButtonText}>Reconcile Pending Sales</Text>
                )}
              </Pressable>
            )}
          </View>
        )}

        {isCloseMode && unsyncedDrawerEvents.length > 0 && (
          <View style={styles.pendingSyncCard}>
            <Text style={styles.pendingSyncTitle}>Drawer events need server sync</Text>
            <Text style={styles.pendingSyncText}>
              {unsyncedDrawerEvents.length} local drawer event(s) must sync before closeout.
            </Text>
            <Text style={styles.pendingSyncMeta}>
              {formatDrawerSummary(unsyncedDrawerSummary)} / net {fmtSignedPHP(unsyncedDrawerSummary.netCash)}
            </Text>
            <Pressable
              style={[styles.pendingSyncButton, reconcilingDrawer && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handleDrawerSyncPress}
              disabled={reconcilingDrawer}
            >
              {reconcilingDrawer ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <Text style={styles.pendingSyncButtonText}>Sync Drawer Events</Text>
              )}
            </Pressable>
          </View>
        )}

        {isCloseMode && (
          <View style={[styles.card, closeoutReady && styles.readyCard]}>
            <View style={styles.auditHeader}>
              <Text style={styles.cardTitle}>Close Readiness</Text>
              <View style={[styles.auditBadge, closeoutReady ? styles.auditBadgeClean : styles.auditBadgeWarn]}>
                <Text style={[styles.auditBadgeText, closeoutReady ? styles.auditBadgeTextClean : styles.auditBadgeTextWarn]}>
                  {closeoutReady ? 'Ready' : 'Not Ready'}
                </Text>
              </View>
            </View>
            <View style={styles.readinessList}>
              <ReadinessRow
                label="Pending sales"
                detail={pendingCounts.total === 0 ? 'No offline sales waiting' : `${pendingCounts.total} must be reconciled`}
                ready={pendingCounts.total === 0}
              />
              <ReadinessRow
                label="Actual cash count"
                detail={countedCashEntered ? fmtPHP(parsedCash) : 'Enter counted cash'}
                ready={countedCashEntered}
              />
              <ReadinessRow
                label="Variance check"
                detail={reviewVariance === null ? 'Waiting for cash count' : fmtSignedPHP(reviewVariance)}
                ready={reviewVariance !== null && Math.abs(reviewVariance) < 50}
                tone={varianceTone}
              />
              <ReadinessRow
                label="Drawer events"
                detail={unsyncedDrawerEvents.length > 0
                  ? `${unsyncedDrawerEvents.length} local-only event(s) must sync`
                  : formatDrawerSummary(drawerSummary)}
                ready={unsyncedDrawerEvents.length === 0}
                tone={unsyncedDrawerEvents.length > 0 ? 'danger' : drawerSummary.eventCount > 0 ? 'warning' : 'success'}
              />
              <ReadinessRow
                label="Refunds and voids"
                detail={hasAuditExceptions ? 'Review exceptions before close' : 'No exceptions recorded'}
                ready={!hasAuditExceptions || reviewAcknowledged}
              />
              <ReadinessRow
                label="Closeout notes"
                detail={needsCloseoutNotes ? 'Required for exceptions' : 'Optional'}
                ready={!needsCloseoutNotes || notes.trim().length >= 3}
              />
              <ReadinessRow
                label="Z-reading print"
                detail={printStatus === 'printed' ? 'Printed successfully' : printStatus === 'failed' ? 'Queued for retry in diagnostics' : 'Print before or after closeout'}
                ready={printStatus === 'printed'}
                tone={printStatus === 'failed' ? 'warning' : 'default'}
              />
            </View>
            {hasAuditExceptions && (
              <Pressable
                style={[styles.reviewCheck, reviewAcknowledged && styles.reviewCheckActive]}
                android_ripple={{ color: colors.accent.glow }}
                onPress={() => setReviewAcknowledged(value => !value)}
              >
                <View style={[styles.reviewCheckIcon, reviewAcknowledged && styles.reviewCheckIconActive]}>
                  {reviewAcknowledged ? (
                    <Icon name="check" size={16} color={colors.text.inverse} />
                  ) : null}
                </View>
                <Text style={[styles.reviewCheckText, reviewAcknowledged && styles.reviewCheckTextActive]}>
                  Manager reviewed cash variance, refunds, voids, and drawer events
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={[styles.card, hasAuditExceptions && styles.auditFlagCard]}>
          <View style={styles.auditHeader}>
            <Text style={styles.cardTitle}>Manager Review</Text>
            <View style={[styles.auditBadge, hasAuditExceptions ? styles.auditBadgeWarn : styles.auditBadgeClean]}>
              <Text style={[styles.auditBadgeText, hasAuditExceptions ? styles.auditBadgeTextWarn : styles.auditBadgeTextClean]}>
                {hasAuditExceptions ? 'Needs Review' : 'Clean'}
              </Text>
            </View>
          </View>
          <View style={styles.auditGrid}>
            <AuditMetric label="Net Sales" value={fmtPHP(zReading.salesSummary.netSales)} />
            <AuditMetric
              label="Cash Variance"
              value={reviewVariance === null ? '-' : fmtSignedPHP(reviewVariance)}
              tone={reviewVariance === null ? 'default' : Math.abs(reviewVariance) < 1 ? 'success' : 'danger'}
            />
            <AuditMetric
              label="Refunds"
              value={`${zReading.accountability.refunds.length} / ${fmtPHP(totalRefundAmount)}`}
              tone={zReading.accountability.refunds.length > 0 ? 'danger' : 'default'}
            />
            <AuditMetric
              label="Voids"
              value={`${zReading.accountability.voids.length} / ${fmtPHP(totalVoidAmount)}`}
              tone={zReading.accountability.voids.length > 0 ? 'danger' : 'default'}
            />
            <AuditMetric
              label="Drawer Net"
              value={fmtSignedPHP(drawerTotalNet)}
              tone={Math.abs(drawerTotalNet) > 0 ? 'danger' : 'default'}
            />
          </View>
          <Text style={styles.auditNote}>
            {hasAuditExceptions
              ? 'Review exceptions and drawer events before filing this Z-reading.'
              : 'No refunds, voids, or cash variance exceptions recorded.'}
          </Text>
        </View>

        {/* 1. Sales Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sales Summary</Text>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Sales</Text>
            <Text style={styles.summaryValue}>{fmtPHP(zReading.salesSummary.grossSales)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Refunds</Text>
            <Text style={[styles.summaryValue, { color: colors.status.danger }]}>
              -{fmtPHP(zReading.salesSummary.refundsTotal)}
            </Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.bold]}>Net Sales</Text>
            <Text style={[styles.summaryValue, styles.bold]}>{fmtPHP(zReading.salesSummary.netSales)}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Transactions</Text>
            <Text style={styles.summaryValue}>{zReading.salesSummary.transactionCount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Avg Ticket</Text>
            <Text style={styles.summaryValue}>{fmtPHP(zReading.salesSummary.avgTicket)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Voids</Text>
            <Text style={[styles.summaryValue, zReading.salesSummary.voidCount > 0 && { color: colors.status.danger }]}>
              {zReading.salesSummary.voidCount}
            </Text>
          </View>
        </View>

        {/* 2. Payment Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Breakdown</Text>
          <View style={styles.separator} />
          {zReading.paymentBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>No payments recorded</Text>
          ) : (
            zReading.paymentBreakdown.map((p, i) => (
              <View key={i} style={[styles.summaryRow, i % 2 === 1 && styles.altRow]}>
                <Text style={styles.summaryLabel}>{formatMethod(p.method)} ({p.count})</Text>
                <Text style={styles.summaryValue}>{fmtPHP(p.total)}</Text>
              </View>
            ))
          )}
        </View>

        {/* 3. Cash Reconciliation */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cash Reconciliation</Text>
          <View style={styles.separator} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Opening Float</Text>
            <Text style={styles.summaryValue}>{fmtPHP(zReading.openingFloat)}</Text>
          </View>
          <View style={styles.cashPlanGrid}>
            <View style={styles.cashPlanCell}>
              <Text style={styles.cashPlanLabel}>Cash Sales</Text>
              <Text style={styles.cashPlanValue}>{fmtPHP(cashPaymentTotal)}</Text>
            </View>
            <View style={styles.cashPlanCell}>
              <Text style={styles.cashPlanLabel}>Non-Cash</Text>
              <Text style={styles.cashPlanValue}>{fmtPHP(nonCashTotal)}</Text>
            </View>
            <View style={styles.cashPlanCell}>
              <Text style={styles.cashPlanLabel}>Paid In</Text>
              <Text style={styles.cashPlanValue}>{fmtPHP(drawerSummary.paidInTotal)}</Text>
            </View>
            <View style={styles.cashPlanCell}>
              <Text style={styles.cashPlanLabel}>Paid Out</Text>
              <Text style={styles.cashPlanValue}>{fmtPHP(drawerSummary.paidOutTotal)}</Text>
            </View>
            <View style={styles.cashPlanCell}>
              <Text style={styles.cashPlanLabel}>Drawer Net</Text>
              <Text style={styles.cashPlanValue}>{fmtSignedPHP(drawerTotalNet)}</Text>
            </View>
            <View style={styles.cashPlanCell}>
              <Text style={styles.cashPlanLabel}>Tenders</Text>
              <Text style={styles.cashPlanValue}>{tenderCount}</Text>
            </View>
          </View>
          {Math.abs(drawerExpectedAdjustment) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Server Expected Before Local Drawer Events</Text>
              <Text style={styles.summaryValue}>{fmtPHP(serverExpectedCash)}</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.bold]}>Expected Cash</Text>
            <Text style={[styles.summaryValue, styles.bold]}>{fmtPHP(expectedCash)}</Text>
          </View>

          {isSnapshotMode && (
            <>
              <View style={styles.separator} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Actual Cash</Text>
                <Text style={styles.summaryValue}>
                  {zReading.cashReconciliation.actualCash === null
                    ? 'Not counted'
                    : fmtPHP(zReading.cashReconciliation.actualCash)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Variance</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    storedVarianceValue === null
                      ? { color: colors.text.muted }
                      : Math.abs(storedVarianceValue) < 1
                        ? { color: colors.status.success }
                        : { color: colors.status.danger },
                  ]}
                >
                  {storedVarianceValue === null ? '-' : fmtSignedPHP(storedVarianceValue)}
                </Text>
              </View>
            </>
          )}

          {isCloseMode && (
            <>
              <View style={styles.separator} />
              <Text style={styles.inputLabel}>Actual Cash Count</Text>
              <TextInput
                style={styles.cashInput}
                value={cashTendered}
                onChangeText={(value) => {
                  setCashTendered(normalizeCashAmount(value));
                  setReviewAcknowledged(false);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
                selectTextOnFocus
              />
              {/* Denomination buttons */}
              <View style={styles.denomRow}>
                <Pressable
                  style={[styles.denomChip, styles.denomExact]}
                  android_ripple={{ color: colors.accent.glow }}
                  onPress={() => {
                    setCashTendered(expectedCash.toFixed(2));
                    setReviewAcknowledged(false);
                  }}
                >
                  <Text style={styles.denomExactText}>Exact</Text>
                </Pressable>
                {[1000, 500, 200, 100, 50, 20].map(d => (
                  <Pressable
                    key={d}
                    style={styles.denomChip}
                    android_ripple={{ color: colors.accent.glow }}
                    onPress={() => {
                      setCashTendered((parsedCash + d).toFixed(2));
                      setReviewAcknowledged(false);
                    }}
                  >
                    <Text style={styles.denomChipText}>+{d >= 1000 ? `${d / 1000}K` : d}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[styles.denomChip, styles.denomClear]}
                  android_ripple={{ color: colors.status.danger + '40' }}
                  onPress={() => {
                    setCashTendered('');
                    setReviewAcknowledged(false);
                  }}
                >
                  <Text style={styles.denomClearText}>C</Text>
                </Pressable>
              </View>

              <View style={styles.cashDisplay}>
                <Text style={styles.cashDisplayLabel}>Cash Counted:</Text>
                <Text style={styles.cashDisplayValue}>
                  {cashTendered ? fmtPHP(parsedCash) : '\u20B10.00'}
                </Text>
              </View>

              {cashTendered !== '' && (
                <View style={[styles.varianceRow, { borderLeftColor: getVarianceColor() }]}>
                  <Text style={styles.varianceLabel}>Variance</Text>
                  <Text style={[styles.varianceValue, { color: getVarianceColor() }]}>
                    {fmtSignedPHP(variance)}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* 4. Top Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top 5 Items</Text>
          <View style={styles.separator} />
          {zReading.topItems.length === 0 ? (
            <Text style={styles.emptyText}>No items sold</Text>
          ) : (
            zReading.topItems.map((item, i) => (
              <View key={i} style={styles.topItemRow}>
                <View style={styles.topItemLeft}>
                  <Text style={styles.topItemRank}>{i + 1}.</Text>
                  <View>
                    <Text style={styles.topItemName} numberOfLines={1}>{item.productName}</Text>
                    <Text style={styles.topItemSku}>{item.mnemonicSku || ''}</Text>
                  </View>
                </View>
                <View style={styles.topItemRight}>
                  <Text style={styles.topItemQty}>{item.unitsSold} sold</Text>
                  <Text style={styles.topItemRevenue}>{fmtPHP(item.totalRevenue)}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 5. Accountability */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Accountability</Text>

          {/* Voids */}
          <View style={styles.separator} />
          <Text style={styles.subSectionTitle}>
            Voids ({zReading.accountability.voids.length})
          </Text>
          {zReading.accountability.voids.length === 0 ? (
            <Text style={styles.emptyText}>No voids</Text>
          ) : (
            zReading.accountability.voids.map((v, i) => (
              <View key={i} style={styles.accountRow}>
                <View>
                  <Text style={styles.accountSaleNo}>{v.saleNo}</Text>
                  <Text style={styles.accountMeta}>
                    {fmtTime(v.voidedAt)} {v.voidedBy && `by ${v.voidedBy}`}
                  </Text>
                  {v.reason && <Text style={styles.accountReason} numberOfLines={1}>{v.reason}</Text>}
                </View>
                <Text style={[styles.accountAmount, { color: colors.status.danger }]}>
                  {fmtPHP(v.amount)}
                </Text>
              </View>
            ))
          )}

          {/* Refunds */}
          <View style={styles.separator} />
          <Text style={styles.subSectionTitle}>
            Refunds ({zReading.accountability.refunds.length})
          </Text>
          {zReading.accountability.refunds.length === 0 ? (
            <Text style={styles.emptyText}>No refunds</Text>
          ) : (
            zReading.accountability.refunds.map((r, i) => (
              <View key={i} style={styles.accountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountSaleNo}>{r.saleNo}</Text>
                  <Text style={styles.accountMeta}>
                    {fmtTime(r.refundedAt)} {r.refundedBy && `by ${r.refundedBy}`}
                  </Text>
                  {r.reason && <Text style={styles.accountReason} numberOfLines={1}>{r.reason}</Text>}
                </View>
                <Text style={[styles.accountAmount, { color: colors.status.danger }]}>
                  {fmtPHP(r.amount)}
                </Text>
              </View>
            ))
          )}

          <View style={styles.separator} />
          <Text style={styles.subSectionTitle}>
            Drawer Events ({drawerSummary.eventCount})
          </Text>
          {drawerSummary.eventCount === 0 ? (
            <Text style={styles.emptyText}>No paid-in, paid-out, or no-sale events</Text>
          ) : (
            drawerEvents.map(event => (
              <View key={event.id} style={styles.accountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountSaleNo}>{drawerActionLabel(event.type)}</Text>
                  <Text style={styles.accountMeta}>
                    {fmtTime(event.createdAt)} by {event.cashierName} / approved by {event.approvedBy}
                    {event.syncStatus === 'synced' ? '' : ' / local only'}
                  </Text>
                  {event.reason ? <Text style={styles.accountReason} numberOfLines={1}>{event.reason}</Text> : null}
                </View>
                <Text
                  style={[
                    styles.accountAmount,
                    event.type === 'PAID_IN'
                      ? { color: colors.status.success }
                      : event.type === 'PAID_OUT'
                        ? { color: colors.status.danger }
                        : { color: colors.text.secondary },
                  ]}
                >
                  {event.type === 'NO_SALE'
                    ? 'Open'
                    : `${event.type === 'PAID_OUT' ? '-' : '+'}${fmtPHP(event.amount)}`}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Close shift notes */}
        {isCloseMode && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{needsCloseoutNotes ? 'Notes (required)' : 'Notes (optional)'}</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="End of day notes..."
              placeholderTextColor={colors.text.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        {isCloseMode ? (
          <>
            <Pressable
              style={[styles.printBtn, printing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handlePreviewPrint}
              disabled={printing}
            >
              <Text style={styles.printBtnText}>Preview</Text>
            </Pressable>
            <Pressable
              style={[styles.printBtn, printing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <Text style={styles.printBtnText}>Print Z-Reading</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.closeShiftBtn, closing && styles.btnDisabled]}
              android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
              onPress={handleCloseShift}
              disabled={closing}
            >
              {closing ? (
                <ActivityIndicator size="small" color={colors.shift.bannerBtnText} />
              ) : (
                <Text style={styles.closeShiftBtnText}>Close Shift</Text>
              )}
            </Pressable>
          </>
        ) : isSnapshotMode ? (
          <>
            <Pressable
              style={[styles.printBtn, { flex: 1 }, printing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handlePreviewPrint}
              disabled={printing}
            >
              <Text style={styles.printBtnText}>Preview</Text>
            </Pressable>
            <Pressable
              style={[styles.printBtn, { flex: 1 }, printing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <Text style={styles.printBtnText}>Reprint Z-Reading</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.printBtn, { flex: 1 }, printing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handlePreviewPrint}
              disabled={printing}
            >
              <Text style={styles.printBtnText}>Preview</Text>
            </Pressable>
            <Pressable
              style={[styles.printBtn, { flex: 1 }, printing && styles.btnDisabled]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              ) : (
                <Text style={styles.printBtnText}>Print X-Reading</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
      <ManagerPinModal
        visible={drawerAuthorizationVisible}
        action={`Sync ${unsyncedDrawerEvents.length} drawer event${unsyncedDrawerEvents.length === 1 ? '' : 's'} before closeout`}
        requiredLevel={3}
        onApprove={handleDrawerAuthorization}
        onCancel={() => setDrawerAuthorizationVisible(false)}
      />
      <ManagerPinModal {...closeShiftElevationProps} />
      <PrintJobPreviewModal
        visible={!!previewJob}
        job={previewJob}
        printerType={printer.type}
        onClose={() => setPreviewJob(null)}
        onPrint={() => { void handlePrint(); }}
        printing={printing}
      />
    </View>
  );
}

function AuditMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  const styles = createStyles();
  return (
    <View style={styles.auditMetric}>
      <Text style={styles.auditMetricLabel}>{label}</Text>
      <Text
        style={[
          styles.auditMetricValue,
          tone === 'success' && { color: colors.status.success },
          tone === 'danger' && { color: colors.status.danger },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function ReadinessRow({
  label,
  detail,
  ready,
  tone = ready ? 'success' : 'danger',
}: {
  label: string;
  detail: string;
  ready: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const styles = createStyles();
  const color =
    tone === 'success'
      ? colors.status.successText
      : tone === 'warning'
        ? colors.status.warningText
        : tone === 'danger'
          ? colors.status.dangerText
          : colors.text.secondary;

  return (
    <View style={styles.readinessRow}>
      <View style={[styles.readinessDot, ready ? styles.readinessDotReady : styles.readinessDotBlock]} />
      <View style={styles.readinessCopy}>
        <Text style={styles.readinessLabel}>{label}</Text>
        <Text style={[styles.readinessDetail, { color }]} numberOfLines={1}>{detail}</Text>
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.text.muted,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.headerPaddingTop,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  backBtn: {
    minWidth: 52,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  backBtnText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    ...textStyles.subheading,
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
  },
  headerSubtitle: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.screenPadding,
  },
  shiftMeta: {
    gap: 2,
  },
  metaText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontFamily: fonts.mono.regular,
  },
  snapshotBanner: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  snapshotTitle: {
    ...textStyles.bodyMedium,
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
  },
  snapshotText: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  pendingSyncCard: {
    backgroundColor: colors.status.warningBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.warning,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  pendingSyncTitle: {
    ...textStyles.bodyMedium,
    color: colors.status.warningText,
    fontFamily: fonts.display.bold,
  },
  pendingSyncText: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  pendingSyncMeta: {
    ...textStyles.captionSmall,
    color: colors.status.warningText,
    marginTop: spacing.xs,
    fontFamily: fonts.body.semiBold,
  },
  pendingSyncButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  pendingSyncButtonText: {
    ...textStyles.button,
    color: colors.accent.primary,
  },
  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginBottom: spacing.lg,
  },
  readyCard: {
    borderColor: colors.status.success,
  },
  cardTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    marginBottom: spacing.sm,
    fontSize: 14,
  },
  auditFlagCard: {
    borderColor: colors.status.warning,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  auditBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  auditBadgeClean: {
    backgroundColor: colors.status.successBg,
    borderColor: colors.status.success,
  },
  auditBadgeWarn: {
    backgroundColor: colors.status.warningBg,
    borderColor: colors.status.warning,
  },
  auditBadgeText: {
    ...textStyles.tiny,
    fontFamily: fonts.display.bold,
  },
  auditBadgeTextClean: {
    color: colors.status.successText,
  },
  auditBadgeTextWarn: {
    color: colors.status.warningText,
  },
  auditGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  readinessList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  readinessRow: {
    width: '48%',
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  readinessDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  readinessDotReady: {
    backgroundColor: colors.status.success,
  },
  readinessDotBlock: {
    backgroundColor: colors.status.danger,
  },
  readinessCopy: {
    flex: 1,
    minWidth: 0,
  },
  readinessLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  readinessDetail: {
    ...textStyles.caption,
    marginTop: 2,
  },
  reviewCheck: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  reviewCheckActive: {
    borderColor: colors.status.success,
    backgroundColor: colors.status.successBg,
  },
  reviewCheckIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.input,
  },
  reviewCheckIconActive: {
    borderColor: colors.status.success,
    backgroundColor: colors.status.success,
  },
  reviewCheckText: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  reviewCheckTextActive: {
    color: colors.status.successText,
    fontFamily: fonts.body.semiBold,
  },
  auditMetric: {
    width: '48%',
    paddingVertical: spacing.xs,
  },
  auditMetricLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  auditMetricValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    marginTop: 2,
  },
  auditNote: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  altRow: {
    backgroundColor: colors.bg.elevated,
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xs,
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  summaryValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontSize: 13,
  },
  bold: {
    fontFamily: fonts.display.bold,
  },
  cashPlanGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  cashPlanCell: {
    width: '48%',
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  cashPlanLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  cashPlanValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    marginTop: 2,
    fontSize: 13,
  },
  emptyText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontStyle: 'italic',
    paddingVertical: spacing.xs,
  },
  // Denomination buttons
  inputLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  cashInput: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: 18,
  },
  denomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  denomChip: {
    width: '23%' as any,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  denomChipText: {
    ...textStyles.caption,
    color: colors.text.primary,
    fontFamily: fonts.mono.medium,
  },
  denomExact: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.glow,
  },
  denomExactText: {
    ...textStyles.caption,
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
  },
  denomClear: {
    borderColor: colors.status.danger,
    backgroundColor: colors.status.dangerBg,
  },
  denomClearText: {
    ...textStyles.caption,
    color: colors.status.danger,
    fontFamily: fonts.display.bold,
  },
  cashDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  cashDisplayLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  cashDisplayValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontFamily: fonts.mono.medium,
    fontSize: 16,
  },
  varianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 3,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.sm,
  },
  varianceLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontFamily: fonts.display.bold,
  },
  varianceValue: {
    ...textStyles.monoMd,
    fontFamily: fonts.mono.medium,
    fontSize: 16,
  },
  // Top items
  topItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  topItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  topItemRank: {
    ...textStyles.caption,
    color: colors.text.muted,
    width: 20,
  },
  topItemName: {
    ...textStyles.caption,
    color: colors.text.primary,
    maxWidth: 200,
  },
  topItemSku: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontFamily: fonts.mono.regular,
  },
  topItemRight: {
    alignItems: 'flex-end',
  },
  topItemQty: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
  },
  topItemRevenue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontSize: 12,
  },
  // Accountability
  subSectionTitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontFamily: fonts.display.bold,
    marginBottom: spacing.xs,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  accountSaleNo: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    fontSize: 12,
  },
  accountMeta: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  accountReason: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
  accountAmount: {
    ...textStyles.monoMd,
    fontSize: 12,
  },
  // Notes
  notesInput: {
    ...textStyles.body,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.sm,
    textAlignVertical: 'top',
    minHeight: 60,
    marginTop: spacing.xs,
  },
  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  printBtn: {
    flex: 1,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printBtnText: {
    ...textStyles.button,
    color: colors.accent.primary,
  },
  closeShiftBtn: {
    flex: 1,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.status.danger,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeShiftBtnText: {
    ...textStyles.button,
    color: colors.text.inverse,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
