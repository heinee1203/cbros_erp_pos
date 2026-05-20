import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getHeldCarts, type HeldCart } from '@/storage/held-carts';
import { selectGrandTotal, selectLineCount, useCartStore } from '@/stores/cart-store';
import { getPendingSales, onPendingSalesChanged } from '@/storage/pending-sales';
import { reconcilePendingSales } from '@/hooks/use-checkout';
import {
  getUnsyncedRegisterDrawerEvents,
  onRegisterDrawerEventsChanged,
} from '@/storage/register-drawer-events';
import { reconcileRegisterDrawerEvents } from '@/sync/register-drawer-sync';
import { useCatalogSearch, type CatalogItem } from '@/hooks/use-catalog-search';
import { useSaleDetailQuery, useSalesListQuery, type SaleListItem } from '@/hooks/use-transactions';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useAuth } from '@/hooks/use-auth';
import { getSyncStatus, onSyncStatus, runFullSync, type SyncStatus } from '@/sync/sync-manager';
import {
  getAutoRetryPrintJobs,
  getPrintJobs,
  getRetryablePrintJobs,
  onPrintJobsChanged,
  clearPrintedPrintJobs,
  type PrintJob,
} from '@/storage/print-jobs';
import {
  buildHardwareTestSummaryText,
  getHardwareTestResults,
  onHardwareTestResultsChanged,
  recordHardwareTestResult,
  type HardwareTestResult,
  type HardwareTestType,
} from '@/storage/hardware-tests';
import { onScannerDiagnosticsChanged } from '@/storage/scanner-diagnostics';
import { recordSupportLog, subscribeSupportLogs } from '@/storage/support-logs';
import {
  buildHardwareReadinessItems,
  buildReadinessSummaryText,
  buildSupportDiagnosticText,
  getRegisterHealthSnapshot,
} from '@/utils/register-health';
import { RefundFlow } from '@/components/RefundFlow';
import { LabelPreviewModal } from '@/components/LabelPreviewModal';
import { BarcodeScanModal } from '@/components/BarcodeScanModal';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { verifyRefundAuthorizationCredential } from '@/utils/refund-authorization';
import { formatPosError } from '@/utils/pos-error-messages';
import { getPendingSaleReviewRows, summarizePendingSales } from '@/utils/pending-sale-summary';
import { getRegisterDrawerRecoveryRows, summarizeRegisterDrawerRecovery } from '@/utils/register-drawer-summary';
import { usePrinter } from '@/hardware/printer/context';
import { buildShelfLabel } from '@/hardware/printer/zpl-label-builder';
import { printEscposRawSafely, printZplSafely, retryPrintJobSafely } from '@/hardware/printer/settings';
import { queryClient } from '@/services/query-client';
import { apiFetch } from '@/services/api-client';
import { APP_BUILD_DATE, APP_GIT_SHA, APP_VERSION } from '@/config/app-version';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';
import { Button, Icon, type IconName } from '@/components/ui';

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtQty(value: number): string {
  return Math.round(value).toLocaleString('en-PH');
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${fmtQty(count)} ${count === 1 ? singular : plural}`;
}

function clampLabelCopies(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtSyncTime(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return 'Unknown';
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

type SyncFreshness = 'fresh' | 'stale' | 'critical';

function getSyncAgeMinutes(ts: string | null): number | null {
  if (!ts) return null;
  const time = new Date(ts).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 60_000));
}

function getInventoryFreshness(ts: string | null): SyncFreshness {
  const minutes = getSyncAgeMinutes(ts);
  if (minutes === null) return 'critical';
  if (minutes < 15) return 'fresh';
  if (minutes < 120) return 'stale';
  return 'critical';
}

function syncFreshnessLabel(freshness: SyncFreshness): string {
  if (freshness === 'fresh') return 'Fresh';
  if (freshness === 'stale') return 'Stale';
  return 'Critical';
}

function syncFreshnessTone(freshness: SyncFreshness): 'success' | 'warning' | 'danger' {
  if (freshness === 'fresh') return 'success';
  if (freshness === 'stale') return 'warning';
  return 'danger';
}

function fmtAttemptTime(ts: string | null): string {
  if (!ts) return 'No attempt this session';
  const ago = fmtSyncTime(ts);
  if (ago === 'Just now') return 'Just now';
  if (ago === 'Unknown') return ago;
  if (ago.includes('/')) return ago;
  return `${ago} ago`;
}

function fmtRetryAt(ts?: string): string {
  if (!ts) return 'Ready now';
  const target = new Date(ts).getTime();
  const diff = target - Date.now();
  if (!Number.isFinite(target) || diff <= 0) return 'Ready now';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes <= 1) return 'Retry in 1m';
  if (minutes < 60) return `Retry in ${minutes}m`;
  return `Retry at ${new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`;
}

function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes[i] = code > 127 ? 0x3f : code;
  }
  return bytes;
}

function hardwareTestTitle(type: HardwareTestType): string {
  switch (type) {
    case 'receipt-printer': return 'Receipt printer test';
    case 'label-printer': return 'ZPL label printer test';
    case 'scanner': return 'Scanner/manual barcode test';
    case 'manager-authorization': return 'Manager authorization test';
    case 'cash-drawer': return 'Cash drawer kick test';
    default: return 'Hardware test';
  }
}

function hardwareStatusLabel(result: HardwareTestResult | null): string {
  if (!result) return 'Not run';
  return result.status === 'pass' ? 'Pass' : 'Fail';
}

function hardwareStatusTone(result: HardwareTestResult | null): 'success' | 'warning' | 'danger' {
  if (!result) return 'warning';
  return result.status === 'pass' ? 'success' : 'danger';
}

function fmtTxnTime(ts: string | null): string {
  if (!ts) return 'Not completed';
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isRefundableStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'PARTIALLY_REFUNDED';
}

function ScreenHeader({ title }: { title: string }) {
  const navigation = useNavigation<any>();
  const styles = createStyles();
  return (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
        <Icon name="chevron-left" size={19} color={colors.text.secondary} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 72 }} />
    </View>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary';
}) {
  const styles = createStyles();
  return (
    <View style={styles.parkedMetricCard}>
      <Text style={styles.parkedMetricLabel}>{label}</Text>
      <Text
        style={[
          styles.parkedMetricValue,
          tone === 'primary' && styles.parkedMetricValuePrimary,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export function ParkedOrdersScreen() {
  const navigation = useNavigation<any>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const activeLineCount = useCartStore(selectLineCount);
  const activeTotal = useCartStore(selectGrandTotal);
  const heldCarts = getHeldCarts();
  const styles = createStyles();

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  void refreshKey;

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  const visibleHeldCarts = heldCarts.filter(cart => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;

    const haystack = [
      cart.label,
      cart.customerName,
      cart.note,
      ...cart.lines.map((line: any) => `${line.name} ${line.sku ?? ''} ${line.mnemonicSku ?? ''}`),
    ].filter(Boolean).join(' ').toLowerCase();

    return haystack.includes(needle);
  });

  const parkedValue = heldCarts.reduce((sum, cart) => sum + cart.totalAmount, 0);
  const parkedItems = heldCarts.reduce((sum, cart) => sum + cart.lines.length, 0);

  const resumeCart = useCallback((cart: HeldCart) => {
    const restored = useCartStore.getState().restoreHeldCart(cart.id);
    if (!restored) {
      Alert.alert(
        'Could Not Resume Order',
        'The active cart could not be parked first. Resume or delete another parked order, then try again.',
      );
      return;
    }

    refresh();
    navigation.getParent()?.navigate('POS');
  }, [navigation, refresh]);

  const handleResume = useCallback((cart: HeldCart) => {
    if (activeLineCount === 0) {
      resumeCart(cart);
      return;
    }

    Alert.alert(
      'Swap Active Cart?',
      `Your current cart (${activeLineCount} item${activeLineCount === 1 ? '' : 's'}, ${fmtPHP(activeTotal)}) will be parked before resuming "${cart.label}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Resume', onPress: () => resumeCart(cart) },
      ],
    );
  }, [activeLineCount, activeTotal, resumeCart]);

  const handleDelete = useCallback((cart: HeldCart) => {
    Alert.alert(
      'Delete Held Order',
      `Remove ${cart.label} with ${cart.lines.length} item${cart.lines.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            useCartStore.getState().deleteHeldCart(cart.id);
            refresh();
          },
        },
      ],
    );
  }, [refresh]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Parked Orders" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.parkedSummaryGrid}>
          <MetricCard label="Parked Orders" value={String(heldCarts.length)} />
          <MetricCard label="Items Waiting" value={String(parkedItems)} />
          <MetricCard label="Parked Value" value={fmtPHP(parkedValue)} tone="primary" />
        </View>

        <View style={styles.returnSearchBox}>
          <Icon name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.returnSearchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search customer, item, SKU, or note"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close" size={17} color={colors.text.secondary} />
            </Pressable>
          )}
        </View>

        {activeLineCount > 0 && (
          <View style={styles.noticeCard}>
            <Icon name="hold" size={18} color={colors.status.warning} />
            <Text style={styles.noticeText}>
              Active cart has {activeLineCount} item{activeLineCount === 1 ? '' : 's'} and will be parked before resuming another order.
            </Text>
          </View>
        )}

        {heldCarts.length === 0 ? (
          <EmptyState
            icon="hold"
            title="No Parked Orders"
            body="Held carts will appear here after a cashier parks an active sale."
          />
        ) : visibleHeldCarts.length === 0 ? (
          <EmptyState
            icon="search"
            title="No Matches"
            body="Try another customer name, SKU, or item description."
          />
        ) : (
          visibleHeldCarts.map(cart => (
            <View key={cart.id} style={styles.heldCard}>
              <View style={styles.heldTopRow}>
                <View style={styles.heldTitleBlock}>
                  <Text style={styles.heldTitle} numberOfLines={1}>{cart.label}</Text>
                  <Text style={styles.heldMeta}>
                    {cart.lines.length} item{cart.lines.length === 1 ? '' : 's'} / {timeAgo(cart.heldAt)}
                  </Text>
                </View>
                <Text style={styles.heldTotal}>{fmtPHP(cart.totalAmount)}</Text>
              </View>

              {(cart.customerName || cart.note) && (
                <View style={styles.heldContext}>
                  {cart.customerName && (
                    <Text style={styles.heldContextText} numberOfLines={1}>Customer: {cart.customerName}</Text>
                  )}
                  {cart.note && (
                    <Text style={styles.heldContextText} numberOfLines={2}>Note: {cart.note}</Text>
                  )}
                </View>
              )}

              <View style={styles.heldPreview}>
                {cart.lines.slice(0, 3).map((line: any) => (
                  <Text key={line.id} style={styles.heldLine} numberOfLines={1}>
                    {line.quantity} x {line.name}
                  </Text>
                ))}
                {cart.lines.length > 3 && (
                  <Text style={styles.heldLineMuted}>+{cart.lines.length - 3} more</Text>
                )}
              </View>

              <View style={styles.heldActions}>
                <Button title="Resume Order" onPress={() => handleResume(cart)} variant="primary" style={{ flex: 1 }} />
                <Pressable style={styles.deleteButton} onPress={() => handleDelete(cart)}>
                  <Icon name="trash" size={20} color={colors.status.danger} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export function SyncManagementScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [reconciling, setReconciling] = useState(false);
  const [drawerReconciling, setDrawerReconciling] = useState(false);
  const [drawerAuthorizationVisible, setDrawerAuthorizationVisible] = useState(false);
  const [scannerTestVisible, setScannerTestVisible] = useState(false);
  const [managerTestVisible, setManagerTestVisible] = useState(false);
  const [pendingSales, setPendingSales] = useState(() => getPendingSales());
  const [pendingDrawerEvents, setPendingDrawerEvents] = useState(() => getUnsyncedRegisterDrawerEvents());
  const [printJobs, setPrintJobs] = useState(() => getPrintJobs());
  const [hardwareTestResults, setHardwareTestResults] = useState(() => getHardwareTestResults());
  const [scannerTick, setScannerTick] = useState(0);
  const [supportLogTick, setSupportLogTick] = useState(0);
  const [retryingPrintJobId, setRetryingPrintJobId] = useState<string | null>(null);
  const [runningHardwareTest, setRunningHardwareTest] = useState<HardwareTestType | null>(null);
  const [apiHealth, setApiHealth] = useState('Not checked');
  const [checkingApiHealth, setCheckingApiHealth] = useState(false);
  const network = useNetworkStatus();
  const printer = usePrinter();
  const styles = createStyles();
  const pendingRetryCount = pendingSales.filter(sale => sale.status !== 'failed').length;
  const pendingFailedCount = pendingSales.length - pendingRetryCount;
  const retryablePrintJobs = getRetryablePrintJobs();
  const autoRetryPrintJobs = getAutoRetryPrintJobs();
  const failedPrintJobs = printJobs.filter(job => job.status === 'failed');
  const pendingSummary = React.useMemo(() => summarizePendingSales(pendingSales), [pendingSales]);
  const pendingRows = React.useMemo(() => getPendingSaleReviewRows(pendingSales, 5), [pendingSales]);
  const lastHardwareTests = React.useMemo(() => ({
    receipt: hardwareTestResults.find(result => result.type === 'receipt-printer') ?? null,
    label: hardwareTestResults.find(result => result.type === 'label-printer') ?? null,
    scanner: hardwareTestResults.find(result => result.type === 'scanner') ?? null,
    manager: hardwareTestResults.find(result => result.type === 'manager-authorization') ?? null,
    drawer: hardwareTestResults.find(result => result.type === 'cash-drawer') ?? null,
  }), [hardwareTestResults]);
  const drawerSummary = React.useMemo(
    () => summarizeRegisterDrawerRecovery(pendingDrawerEvents),
    [pendingDrawerEvents],
  );
  const drawerRows = React.useMemo(
    () => getRegisterDrawerRecoveryRows(pendingDrawerEvents, 5),
    [pendingDrawerEvents],
  );
  const inventoryFreshness = getInventoryFreshness(syncStatus.lastInventorySync);
  const inventoryTone = syncFreshnessTone(inventoryFreshness);
  const healthSnapshot = React.useMemo(
    () => getRegisterHealthSnapshot(printer),
    [
      printer,
      printer.isConnected,
      pendingSales.length,
      pendingDrawerEvents.length,
      printJobs.length,
      hardwareTestResults.length,
      scannerTick,
      supportLogTick,
      syncStatus.lastCatalogSync,
      syncStatus.lastInventorySync,
    ],
  );
  const hardwareReadinessItems = React.useMemo(
    () => buildHardwareReadinessItems({
      snapshot: healthSnapshot,
      apiHealth,
      networkOnline: network.isOnline,
      inventoryFreshness,
      syncError: syncStatus.error,
      pendingSaleReviewCount: pendingFailedCount,
      drawerReviewCount: drawerSummary.failed,
    }),
    [
      apiHealth,
      drawerSummary.failed,
      healthSnapshot,
      inventoryFreshness,
      network.isOnline,
      pendingFailedCount,
      syncStatus.error,
    ],
  );
  const supportDiagnosticText = React.useMemo(
    () => [
      buildSupportDiagnosticText(healthSnapshot, apiHealth),
      '',
      'HARDWARE READINESS',
      buildReadinessSummaryText(hardwareReadinessItems),
      '',
      'HARDWARE TESTS',
      buildHardwareTestSummaryText(hardwareTestResults),
    ].join('\n'),
    [apiHealth, hardwareReadinessItems, hardwareTestResults, healthSnapshot],
  );
  const canRunSync = network.isOnline && !syncStatus.isSyncing;
  const canReconcile = network.isOnline && !reconciling && pendingRetryCount > 0;
  const canReconcileDrawer = network.isOnline && !drawerReconciling && pendingDrawerEvents.length > 0;

  useEffect(() => {
    setPendingSales(getPendingSales());
    setPendingDrawerEvents(getUnsyncedRegisterDrawerEvents());
    return onSyncStatus(status => {
      setSyncStatus(status);
      setPendingSales(getPendingSales());
      setPendingDrawerEvents(getUnsyncedRegisterDrawerEvents());
    });
  }, []);

  useEffect(() => onPendingSalesChanged(setPendingSales), []);
  useEffect(() => onRegisterDrawerEventsChanged(() => {
    setPendingDrawerEvents(getUnsyncedRegisterDrawerEvents());
  }), []);
  useEffect(() => onPrintJobsChanged(setPrintJobs), []);
  useEffect(() => onHardwareTestResultsChanged(setHardwareTestResults), []);
  useEffect(() => onScannerDiagnosticsChanged(() => {
    setScannerTick(tick => tick + 1);
  }), []);
  useEffect(() => subscribeSupportLogs(() => {
    setSupportLogTick(tick => tick + 1);
  }), []);

  useFocusEffect(useCallback(() => {
    setPendingSales(getPendingSales());
    setPendingDrawerEvents(getUnsyncedRegisterDrawerEvents());
    setPrintJobs(getPrintJobs());
    setHardwareTestResults(getHardwareTestResults());
  }, []));

  const handleApiHealthCheck = useCallback(async () => {
    setCheckingApiHealth(true);
    setApiHealth('Checking...');
    try {
      await apiFetch('/health', { skipAuth: true });
      setApiHealth('OK');
    } catch (err: any) {
      setApiHealth(formatPosError(err, 'Unavailable'));
    } finally {
      setCheckingApiHealth(false);
    }
  }, []);

  const handleFullSync = useCallback(async () => {
    if (!network.isOnline) {
      Alert.alert('Offline', 'Connect to the server before running a full catalog and inventory sync.');
      return;
    }
    try {
      const result = await runFullSync();
      setSyncStatus(result);
      if (result.error) {
        recordSupportLog({
          category: 'sync',
          level: 'error',
          message: 'Full sync failed',
          detail: result.error,
        });
        Alert.alert('Sync Failed', formatPosError(result.error, 'Catalog and inventory could not be updated.'));
      } else {
        recordSupportLog({
          category: 'sync',
          level: 'info',
          message: 'Full sync completed',
        });
        Alert.alert('Sync Complete', 'Catalog and inventory are up to date.');
      }
    } finally {
      setPendingSales(getPendingSales());
    }
  }, [network.isOnline]);

  const handleReconcile = useCallback(async () => {
    if (!network.isOnline) {
      Alert.alert('Offline', 'Pending sales will reconcile once this register is online again.');
      return;
    }
    setReconciling(true);
    try {
      const summary = await reconcilePendingSales();
      recordSupportLog({
        category: 'sync',
        level: summary.failed > 0 ? 'error' : summary.retryLater > 0 ? 'warning' : 'info',
        message: 'Pending sale reconciliation finished',
        context: {
          synced: summary.synced,
          failed: summary.failed,
          retryLater: summary.retryLater,
          alreadyCompleted: summary.alreadyCompleted,
        },
      });
      setPendingSales(getPendingSales());

      if (summary.failed > 0) {
        Alert.alert(
          'Manager Review Needed',
          `${summary.failed} pending sale${summary.failed === 1 ? '' : 's'} could not be reconciled automatically.`,
        );
      } else if (summary.blockedReason === 'store_lock') {
        Alert.alert(
          'Register Locked Store Required',
          formatPosError('Register this device to a store before processing pending sales.'),
        );
      } else if (summary.retryLater > 0) {
        Alert.alert(
          'Still Pending',
          `${summary.retryLater} sale${summary.retryLater === 1 ? '' : 's'} will retry when the server is reachable.`,
        );
      } else {
        const completed = summary.synced + summary.alreadyCompleted;
        Alert.alert(
          'Reconciliation Complete',
          `${completed} pending sale${completed === 1 ? '' : 's'} cleared.`,
        );
      }
    } catch (err: any) {
      recordSupportLog({
        category: 'checkout',
        level: 'error',
        message: 'Pending sale reconciliation failed',
        detail: err?.message || String(err),
      });
      Alert.alert('Reconciliation Failed', formatPosError(err, 'Unable to process pending sales.'));
    } finally {
      setReconciling(false);
      setPendingSales(getPendingSales());
    }
  }, []);

  const handleDrawerReconcilePress = useCallback(() => {
    if (!network.isOnline) {
      Alert.alert('Offline', 'Drawer events will sync once this register is online again.');
      return;
    }
    if (pendingDrawerEvents.length === 0) {
      Alert.alert('No Drawer Events', 'There are no local drawer events waiting for sync.');
      return;
    }
    setDrawerAuthorizationVisible(true);
  }, [network.isOnline, pendingDrawerEvents.length]);

  const handleDrawerAuthorization = useCallback(async (
    _approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    setDrawerAuthorizationVisible(false);
    if (!approval?.credential) {
      Alert.alert('Authorization Required', 'Manager approval was not captured.');
      return;
    }

    setDrawerReconciling(true);
    try {
      const summary = await reconcileRegisterDrawerEvents({
        credential: approval.credential,
        method: approval.method,
      });
      recordSupportLog({
        category: 'drawer',
        level: summary.failed > 0 ? 'error' : summary.retryLater > 0 ? 'warning' : 'info',
        message: 'Drawer event sync finished',
        context: {
          synced: summary.synced,
          failed: summary.failed,
          retryLater: summary.retryLater,
        },
      });
      setPendingDrawerEvents(getUnsyncedRegisterDrawerEvents());
      queryClient.invalidateQueries({ queryKey: ['shifts'] });

      if (summary.blockedReason === 'store_lock') {
        Alert.alert(
          'Register Locked Store Required',
          formatPosError('Register this device to a store before syncing drawer events.'),
        );
      } else if (summary.failed > 0) {
        Alert.alert(
          'Manager Review Needed',
          `${summary.failed} drawer event${summary.failed === 1 ? '' : 's'} could not be synced automatically.`,
        );
      } else if (summary.retryLater > 0) {
        Alert.alert(
          'Still Pending',
          `${summary.retryLater} drawer event${summary.retryLater === 1 ? '' : 's'} will retry when the server is reachable.`,
        );
      } else {
        Alert.alert(
          'Drawer Events Synced',
          `${summary.synced} drawer event${summary.synced === 1 ? '' : 's'} recorded on the server.`,
        );
      }
    } catch (err: any) {
      recordSupportLog({
        category: 'drawer',
        level: 'error',
        message: 'Drawer event sync failed',
        detail: err?.message || String(err),
      });
      Alert.alert('Drawer Sync Failed', formatPosError(err, 'Unable to sync drawer events.'));
    } finally {
      setDrawerReconciling(false);
      setPendingDrawerEvents(getUnsyncedRegisterDrawerEvents());
    }
  }, []);

  const handleRetryPrintJob = useCallback(async (job: PrintJob) => {
    setRetryingPrintJobId(job.id);
    try {
      const result = await retryPrintJobSafely(printer, job);
      setPrintJobs(getPrintJobs());
      if (result.success) {
        recordSupportLog({
          category: 'print',
          level: 'info',
          message: 'Manual print retry succeeded',
          context: { jobId: job.id, type: job.type },
        });
        Alert.alert('Print Job Sent', `${job.title} printed successfully.`);
      } else {
        recordSupportLog({
          category: 'print',
          level: 'error',
          message: 'Manual print retry failed',
          detail: result.error,
          context: { jobId: job.id, type: job.type },
        });
        Alert.alert('Print Job Failed', result.error || 'The printer did not accept this job.');
      }
    } finally {
      setRetryingPrintJobId(null);
      setPrintJobs(getPrintJobs());
    }
  }, [printer]);

  const handleClearPrinted = useCallback(() => {
    clearPrintedPrintJobs();
    setPrintJobs(getPrintJobs());
  }, []);

  const recordHardwareResult = useCallback((
    type: HardwareTestType,
    status: 'pass' | 'fail',
    note?: string,
    error?: string,
  ) => {
    const result = recordHardwareTestResult({
      type,
      title: hardwareTestTitle(type),
      status,
      operator: user?.fullName ?? user?.email ?? 'Unknown operator',
      note,
      error,
    });
    setHardwareTestResults(getHardwareTestResults());
    return result;
  }, [user?.email, user?.fullName]);

  const handleReceiptHardwareTest = useCallback(async () => {
    setRunningHardwareTest('receipt-printer');
    try {
      const body = [
        '',
        'APEX POS HARDWARE TEST',
        `Receipt printer ${new Date().toLocaleString('en-PH')}`,
        `Operator ${user?.fullName ?? user?.email ?? 'Unknown'}`,
        '',
      ].join('\n');
      const result = await printEscposRawSafely(printer, asciiBytes(body), {
        type: 'test-page',
        title: hardwareTestTitle('receipt-printer'),
        sourceId: 'hardware-receipt-test',
      });
      recordHardwareResult(
        'receipt-printer',
        result.success ? 'pass' : 'fail',
        result.success ? 'Receipt test page sent.' : undefined,
        result.error,
      );
      Alert.alert(result.success ? 'Receipt Test Sent' : 'Receipt Test Failed', result.error || 'The receipt test was recorded.');
    } finally {
      setRunningHardwareTest(null);
    }
  }, [printer, recordHardwareResult, user?.email, user?.fullName]);

  const handleLabelHardwareTest = useCallback(async () => {
    setRunningHardwareTest('label-printer');
    try {
      const zpl = [
        '^XA',
        '^FO40,36^A0N,36,36^FDAPEX POS TEST^FS',
        '^FO40,86^A0N,24,24^FDZPL label printer ready^FS',
        '^FO40,126^BY2^BCN,70,Y,N,N^FDAPEX-HW-TEST^FS',
        '^XZ',
      ].join('');
      const result = await printZplSafely(printer, zpl, {
        type: 'test-page',
        title: hardwareTestTitle('label-printer'),
        sourceId: 'hardware-label-test',
      });
      recordHardwareResult(
        'label-printer',
        result.success ? 'pass' : 'fail',
        result.success ? 'ZPL label test sent.' : undefined,
        result.error,
      );
      Alert.alert(result.success ? 'Label Test Sent' : 'Label Test Failed', result.error || 'The label test was recorded.');
    } finally {
      setRunningHardwareTest(null);
    }
  }, [printer, recordHardwareResult]);

  const handleDrawerHardwareTest = useCallback(async () => {
    setRunningHardwareTest('cash-drawer');
    try {
      if (!printer.isConnected) {
        recordHardwareResult('cash-drawer', 'fail', undefined, 'Printer is not connected.');
        Alert.alert('Cash Drawer Test Failed', 'Connect the receipt printer before testing the drawer kick.');
        return;
      }
      await printer.openCashDrawer();
      recordHardwareResult('cash-drawer', 'pass', 'Cash drawer kick command sent.');
      Alert.alert('Cash Drawer Test Sent', 'Confirm the drawer opened, then record any physical issue for support.');
    } catch (err: any) {
      const message = err?.message || 'Cash drawer command failed.';
      recordHardwareResult('cash-drawer', 'fail', undefined, message);
      Alert.alert('Cash Drawer Test Failed', message);
    } finally {
      setRunningHardwareTest(null);
    }
  }, [printer, recordHardwareResult]);

  const handleScannerHardwareSubmit = useCallback((barcode: string) => {
    recordHardwareResult('scanner', 'pass', `Captured ${barcode.slice(0, 24)}.`);
    setScannerTestVisible(false);
    return true;
  }, [recordHardwareResult]);

  const handleManagerHardwareApproved = useCallback((
    _approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    recordHardwareResult(
      'manager-authorization',
      'pass',
      `Approved by ${approval?.approverName ?? _approverName} using ${approval?.method ?? 'credential'}.`,
    );
    setManagerTestVisible(false);
  }, [recordHardwareResult]);

  return (
    <View
      style={styles.container}
      testID="recovery-diagnostics-screen"
      accessibilityLabel="Recovery and Diagnostics screen"
    >
      <ScreenHeader title="Recovery & Diagnostics" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.syncHealthCard, styles[`syncHealth_${inventoryTone}`]]}>
          <View style={styles.syncHealthHeader}>
            <View style={styles.syncHealthTitleRow}>
              <Icon name="sync" size={22} color={colors.accent.primary} />
              <View>
                <Text style={styles.syncHealthTitle}>Inventory Health</Text>
                <Text style={styles.syncHealthSubtitle}>
                  {network.isOnline ? 'Server reachable' : 'Working offline'}
                </Text>
              </View>
            </View>
            <View style={[styles.syncHealthBadge, styles[`syncBadge_${inventoryTone}`]]}>
              <Text style={[styles.syncHealthBadgeText, styles[`syncBadgeText_${inventoryTone}`]]}>
                {syncFreshnessLabel(inventoryFreshness)}
              </Text>
            </View>
          </View>

          <View style={styles.syncMetricGrid}>
            <SyncMetric label="Inventory" value={fmtSyncTime(syncStatus.lastInventorySync)} tone={inventoryTone} />
            <SyncMetric label="Catalog" value={fmtSyncTime(syncStatus.lastCatalogSync)} />
            <SyncMetric label="Network" value={network.isOnline ? 'Online' : 'Offline'} tone={network.isOnline ? 'success' : 'warning'} />
            <SyncMetric label="Last Attempt" value={fmtAttemptTime(syncStatus.lastAttemptFinishedAt ?? syncStatus.lastAttemptStartedAt)} />
          </View>

          {syncStatus.error ? (
            <View style={styles.syncErrorCard}>
              <Icon name="alert" size={18} color={colors.status.danger} />
              <Text style={styles.syncErrorText}>{syncStatus.error}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.syncChecklistCard}>
          <View style={styles.syncChecklistHeader}>
            <View>
              <Text style={styles.syncChecklistTitle}>Hardware Readiness</Text>
              <Text style={styles.syncChecklistSubtitle}>Blocked items are sorted first for support and shift leads.</Text>
            </View>
            <View style={styles.readinessCountPill}>
              <Text style={styles.readinessCountText}>
                {hardwareReadinessItems.filter(item => item.state === 'blocked').length} Blocked
              </Text>
            </View>
          </View>
          {hardwareReadinessItems.map(item => (
            <SyncCheckRow
              key={item.id}
              label={item.label}
              detail={item.actionLabel ? `${item.detail} / ${item.actionLabel}` : item.detail}
              ready={item.state === 'ready'}
              warning={item.state === 'warning'}
            />
          ))}
        </View>

        <View
          style={styles.pendingReviewCard}
          testID="hardware-test-section"
          accessibilityLabel="Hardware Certification section"
        >
          <View style={styles.pendingReviewHeader}>
            <View>
              <Text style={styles.pendingReviewTitle}>Hardware Certification</Text>
              <Text style={styles.pendingReviewSubtitle}>Certify receipt, label, scanner, manager, and drawer readiness for this store.</Text>
            </View>
            <Icon name="settings" size={22} color={colors.accent.primary} />
          </View>
          <View style={styles.pendingReviewMetrics}>
            <SyncMetric label="Receipt" value={hardwareStatusLabel(lastHardwareTests.receipt)} tone={hardwareStatusTone(lastHardwareTests.receipt)} />
            <SyncMetric label="Label" value={hardwareStatusLabel(lastHardwareTests.label)} tone={hardwareStatusTone(lastHardwareTests.label)} />
            <SyncMetric label="Scanner" value={hardwareStatusLabel(lastHardwareTests.scanner)} tone={hardwareStatusTone(lastHardwareTests.scanner)} />
            <SyncMetric label="Manager" value={hardwareStatusLabel(lastHardwareTests.manager)} tone={hardwareStatusTone(lastHardwareTests.manager)} />
          </View>
          <View style={styles.hardwareButtonGrid}>
            <HardwareTestButton
              label={runningHardwareTest === 'receipt-printer' ? 'Testing Receipt' : 'Receipt Test'}
              onPress={() => { void handleReceiptHardwareTest(); }}
              disabled={runningHardwareTest !== null}
            />
            <HardwareTestButton
              label={runningHardwareTest === 'label-printer' ? 'Testing Label' : 'Label Test'}
              onPress={() => { void handleLabelHardwareTest(); }}
              disabled={runningHardwareTest !== null}
            />
            <HardwareTestButton
              label="Scanner Test"
              onPress={() => setScannerTestVisible(true)}
              disabled={runningHardwareTest !== null}
            />
            <HardwareTestButton
              label="Manager Auth"
              onPress={() => setManagerTestVisible(true)}
              disabled={runningHardwareTest !== null}
            />
            <HardwareTestButton
              label={runningHardwareTest === 'cash-drawer' ? 'Testing Drawer' : 'Drawer Kick'}
              onPress={() => { void handleDrawerHardwareTest(); }}
              disabled={runningHardwareTest !== null}
            />
          </View>
          {hardwareTestResults.length === 0 ? (
            <Text style={styles.emptyInlineText}>No hardware tests have been recorded on this tablet.</Text>
          ) : (
            <View style={styles.pendingReviewRows}>
              {hardwareTestResults.slice(0, 5).map(result => (
                <View key={result.id} style={styles.hardwareResultRow}>
                  <View style={[
                    styles.pendingSaleDot,
                    result.status === 'pass' ? styles.pendingSaleDotInfo : styles.pendingSaleDotDanger,
                  ]} />
                  <View style={styles.pendingSaleCopy}>
                    <Text style={styles.pendingSaleTitle} numberOfLines={1}>{result.title}</Text>
                    <Text style={styles.pendingSaleDetail} numberOfLines={1}>
                      {result.status.toUpperCase()} / {new Date(result.createdAt).toLocaleTimeString('en-PH')} / {result.operator || 'Unknown operator'}
                    </Text>
                    {(result.error || result.note) ? (
                      <Text style={result.error ? styles.printJobError : styles.printJobMeta} numberOfLines={1}>
                        {result.error || result.note}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {pendingSales.length > 0 && (
          <View style={styles.pendingReviewCard}>
            <View style={styles.pendingReviewHeader}>
              <View>
                <Text style={styles.pendingReviewTitle}>Pending Sale Review</Text>
                <Text style={styles.pendingReviewSubtitle}>
                  Oldest {pendingSummary.oldestAgeLabel} / {fmtPHP(pendingSummary.totalPayments)} queued
                </Text>
              </View>
              <View style={styles.pendingReviewBadge}>
                <Text style={styles.pendingReviewBadgeText}>{pendingSummary.total}</Text>
              </View>
            </View>
            <View style={styles.pendingReviewMetrics}>
              <SyncMetric label="Retryable" value={String(pendingSummary.retryable)} tone={pendingSummary.retryable > 0 ? 'warning' : 'success'} />
              <SyncMetric label="Review" value={String(pendingSummary.failed)} tone={pendingSummary.failed > 0 ? 'danger' : 'success'} />
              <SyncMetric label="Offline" value={String(pendingSummary.fullyOffline)} />
              <SyncMetric label="Complete" value={String(pendingSummary.completionOnly)} />
            </View>
            <View style={styles.pendingReviewRows}>
              {pendingRows.map(row => (
                <View key={row.id} style={styles.pendingSaleRow}>
                  <View style={[
                    styles.pendingSaleDot,
                    row.tone === 'danger' ? styles.pendingSaleDotDanger : row.tone === 'info' ? styles.pendingSaleDotInfo : styles.pendingSaleDotWarning,
                  ]} />
                  <View style={styles.pendingSaleCopy}>
                    <Text style={styles.pendingSaleTitle} numberOfLines={1}>{row.title}</Text>
                    <Text style={styles.pendingSaleDetail} numberOfLines={1}>{row.detail}</Text>
                  </View>
                  <View style={styles.pendingSaleMeta}>
                    <Text style={styles.pendingSaleAmount}>{row.amountLabel}</Text>
                    <Text style={styles.pendingSaleStatus}>{row.statusLabel}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {pendingDrawerEvents.length > 0 && (
          <View style={styles.pendingReviewCard}>
            <View style={styles.pendingReviewHeader}>
              <View>
                <Text style={styles.pendingReviewTitle}>Drawer Event Recovery</Text>
                <Text style={styles.pendingReviewSubtitle}>
                  Oldest {drawerSummary.oldestAgeLabel} / {fmtPHP(drawerSummary.netCashImpact)} net cash impact
                </Text>
              </View>
              <View style={styles.pendingReviewBadge}>
                <Text style={styles.pendingReviewBadgeText}>{drawerSummary.total}</Text>
              </View>
            </View>
            <View style={styles.pendingReviewMetrics}>
              <SyncMetric label="Retryable" value={String(drawerSummary.retryable)} tone={drawerSummary.retryable > 0 ? 'warning' : 'success'} />
              <SyncMetric label="Review" value={String(drawerSummary.failed)} tone={drawerSummary.failed > 0 ? 'danger' : 'success'} />
              <SyncMetric label="Paid In" value={fmtPHP(drawerSummary.paidInTotal)} />
              <SyncMetric label="Paid Out" value={fmtPHP(drawerSummary.paidOutTotal)} />
            </View>
            <View style={styles.pendingReviewRows}>
              {drawerRows.map(row => (
                <View key={row.id} style={styles.pendingSaleRow}>
                  <View style={[
                    styles.pendingSaleDot,
                    row.tone === 'danger' ? styles.pendingSaleDotDanger : styles.pendingSaleDotWarning,
                  ]} />
                  <View style={styles.pendingSaleCopy}>
                    <Text style={styles.pendingSaleTitle} numberOfLines={1}>{row.title}</Text>
                    <Text style={styles.pendingSaleDetail} numberOfLines={1}>{row.detail}</Text>
                  </View>
                  <View style={styles.pendingSaleMeta}>
                    <Text style={styles.pendingSaleAmount}>{row.amountLabel}</Text>
                    <Text style={styles.pendingSaleStatus}>{row.statusLabel}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.pendingReviewCard}>
          <View style={styles.pendingReviewHeader}>
            <View>
              <Text style={styles.pendingReviewTitle}>Printer Queue</Text>
              <Text style={styles.pendingReviewSubtitle}>
                {printer.isConnected ? 'Printer connected' : 'Printer not connected'} / {retryablePrintJobs.length} retryable
              </Text>
            </View>
            <View style={styles.pendingReviewBadge}>
              <Text style={styles.pendingReviewBadgeText}>{printJobs.length}</Text>
            </View>
          </View>
          <View style={styles.pendingReviewMetrics}>
            <SyncMetric label="Failed" value={String(failedPrintJobs.length)} tone={failedPrintJobs.length > 0 ? 'danger' : 'success'} />
            <SyncMetric label="Retryable" value={String(retryablePrintJobs.length)} tone={retryablePrintJobs.length > 0 ? 'warning' : 'success'} />
            <SyncMetric label="Auto Due" value={String(autoRetryPrintJobs.length)} tone={autoRetryPrintJobs.length > 0 ? 'warning' : 'success'} />
            <SyncMetric label="Mode" value={healthSnapshot.printerType} />
          </View>
          {printJobs.length === 0 ? (
            <Text style={styles.emptyInlineText}>No print jobs have been recorded on this tablet.</Text>
          ) : (
            <View style={styles.pendingReviewRows}>
              {printJobs.slice(0, 5).map(job => (
                <View key={job.id} style={styles.printJobRow}>
                  <View style={styles.pendingSaleCopy}>
                    <Text style={styles.pendingSaleTitle} numberOfLines={1}>{job.title}</Text>
                    <Text style={styles.pendingSaleDetail} numberOfLines={1}>
                      {job.type.replace('-', ' ')} / {job.status} / {job.attempts} attempt{job.attempts === 1 ? '' : 's'} / {fmtRetryAt(job.nextRetryAt)}
                    </Text>
                    {job.lastAttemptReason ? (
                      <Text style={styles.printJobMeta} numberOfLines={1}>
                        Last attempt: {job.lastAttemptReason}; auto retries: {job.autoRetryCount ?? 0}
                      </Text>
                    ) : null}
                    {job.lastError ? (
                      <Text style={styles.printJobError} numberOfLines={1}>{job.lastError}</Text>
                    ) : null}
                  </View>
                  {(job.status === 'failed' || job.status === 'pending') && (
                    <Pressable
                      style={[styles.retryPrintButton, retryingPrintJobId === job.id && styles.retryPrintButtonDisabled]}
                      onPress={() => { void handleRetryPrintJob(job); }}
                      disabled={retryingPrintJobId === job.id}
                      android_ripple={{ color: colors.accent.glow }}
                    >
                      <Text style={styles.retryPrintButtonText}>
                        {retryingPrintJobId === job.id ? 'Retrying' : 'Retry'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
          {printJobs.some(job => job.status === 'printed') && (
            <Pressable style={styles.clearPrintedButton} onPress={handleClearPrinted} hitSlop={8}>
              <Text style={styles.clearPrintedText}>Clear printed jobs</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.infoCard}>
          <InfoRow label="Status" value={syncStatus.isSyncing ? 'Syncing' : 'Idle'} />
          <InfoRow label="Catalog" value={fmtSyncTime(syncStatus.lastCatalogSync)} />
          <InfoRow label="Inventory" value={fmtSyncTime(syncStatus.lastInventorySync)} tone={inventoryTone} />
          <InfoRow label="Pending Sales" value={String(pendingSales.length)} warning={pendingSales.length > 0} />
          <InfoRow label="Drawer Events" value={String(pendingDrawerEvents.length)} warning={pendingDrawerEvents.length > 0} />
          <InfoRow label="Print Queue" value={String(retryablePrintJobs.length)} warning={retryablePrintJobs.length > 0} />
          <InfoRow label="Store" value={healthSnapshot.boundStore} warning={healthSnapshot.boundStore === 'Not registered'} />
          <InfoRow label="API Health" value={apiHealth} warning={apiHealth !== 'OK'} />
          {pendingSales.length > 0 && (
            <InfoRow
              label="Needs Review"
              value={String(pendingFailedCount)}
              warning={pendingFailedCount > 0}
            />
          )}
          {pendingDrawerEvents.length > 0 && (
            <InfoRow
              label="Drawer Review"
              value={String(drawerSummary.failed)}
              warning={drawerSummary.failed > 0}
            />
          )}
        </View>

        {syncStatus.progress && (
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>{syncStatus.progress.phase.toUpperCase()}</Text>
            <Text style={styles.progressText}>{syncStatus.progress.synced} records synced</Text>
          </View>
        )}

        <View style={styles.actionStack}>
          <Button
            title={checkingApiHealth ? 'Checking API...' : 'Check API Health'}
            onPress={handleApiHealthCheck}
            loading={checkingApiHealth}
            disabled={checkingApiHealth}
            variant="secondary"
            fullWidth
          />
          <Button
            title="Open Printer Setup"
            onPress={() => navigation.navigate('PrinterSetup')}
            variant="secondary"
            fullWidth
          />
          <Button
            title={syncStatus.isSyncing ? 'Syncing...' : 'Run Full Sync'}
            onPress={handleFullSync}
            loading={syncStatus.isSyncing}
            disabled={!canRunSync}
            fullWidth
          />
          <Button
            title={reconciling ? 'Reconciling...' : 'Reconcile Pending Sales'}
            onPress={handleReconcile}
            loading={reconciling}
            disabled={!canReconcile}
            variant="secondary"
            fullWidth
          />
          <Button
            title={drawerReconciling ? 'Syncing Drawer Events...' : 'Sync Drawer Events'}
            onPress={handleDrawerReconcilePress}
            loading={drawerReconciling}
            disabled={!canReconcileDrawer}
            variant="secondary"
            fullWidth
          />
        </View>

        <View style={styles.diagnosticsCard}>
          <View style={styles.pendingReviewHeader}>
            <View>
              <Text style={styles.pendingReviewTitle}>Copy Support Packet</Text>
              <Text style={styles.pendingReviewSubtitle}>Long-press and copy this packet for support; secrets are redacted before storage.</Text>
            </View>
            <Icon name="info" size={22} color={colors.accent.primary} />
          </View>
          <View style={styles.diagnosticsGrid}>
            <InfoRow label="Device ID" value={healthSnapshot.deviceId} />
            <InfoRow label="Store Code" value={healthSnapshot.storeCode} />
            <InfoRow label="Printer" value={healthSnapshot.printerStatus} warning={!printer.isConnected} />
            <InfoRow label="Scanner" value={healthSnapshot.scannerMode} />
            <InfoRow label="Capture" value={healthSnapshot.scannerCapture} warning={healthSnapshot.scannerCapture !== 'Idle'} />
            <InfoRow label="Last Scan" value={healthSnapshot.lastScan} />
            <InfoRow label="App Build" value={`${healthSnapshot.appVersion} / ${healthSnapshot.build}`} />
            <InfoRow label="Git SHA" value={healthSnapshot.gitSha} />
            <InfoRow label="Device Status" value={healthSnapshot.disabledState} warning={healthSnapshot.disabledState !== 'Active'} />
            <InfoRow label="API Base" value={healthSnapshot.apiBaseUrl} />
          </View>
          <Text selectable style={styles.diagnosticsText}>{supportDiagnosticText}</Text>
        </View>
      </ScrollView>
      <ManagerPinModal
        visible={drawerAuthorizationVisible}
        action={`Sync ${pendingDrawerEvents.length} register drawer event${pendingDrawerEvents.length === 1 ? '' : 's'}`}
        requiredLevel={2}
        onApprove={handleDrawerAuthorization}
        onCancel={() => setDrawerAuthorizationVisible(false)}
      />
      <BarcodeScanModal
        visible={scannerTestVisible}
        title="Hardware Scanner Test"
        subtitle="Scan with the paired scanner or type a barcode manually. This records a local support test only."
        actionLabel="Record Scanner Test"
        onSubmit={handleScannerHardwareSubmit}
        onClose={() => setScannerTestVisible(false)}
      />
      <ManagerPinModal
        visible={managerTestVisible}
        action="Hardware manager authorization test"
        requiredLevel={2}
        onApprove={handleManagerHardwareApproved}
        onCancel={() => setManagerTestVisible(false)}
      />
    </View>
  );
}

export function AboutScreen() {
  const styles = createStyles();
  return (
    <View style={styles.container}>
      <ScreenHeader title="About" />
      <View style={styles.aboutContent}>
        <View style={styles.aboutLogo}>
          <Text style={styles.aboutLogoText}>A</Text>
        </View>
        <Text style={styles.aboutTitle}>APEX POS</Text>
        <Text style={styles.aboutSubtitle}>C-BROS Genuine Autoparts & Accessories, Inc.</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Version" value={APP_VERSION} />
          <InfoRow label="Build" value={APP_BUILD_DATE} />
          <InfoRow label="Git SHA" value={APP_GIT_SHA} />
          <InfoRow label="Platform" value="Android POS" />
        </View>
      </View>
    </View>
  );
}

export function ReturnsScreen() {
  const [searchText, setSearchText] = useState('');
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const { data: sales, isLoading, refetch } = useSalesListQuery(searchText || undefined);
  const { data: refundSale } = useSaleDetailQuery(refundSaleId ?? '');
  const styles = createStyles();

  const visibleSales = (sales ?? []).filter(s =>
    isRefundableStatus(s.status) || s.status === 'REFUNDED',
  );

  const openRefund = useCallback((sale: SaleListItem) => {
    if (!isRefundableStatus(sale.status)) return;
    setRefundSaleId(sale.id);
  }, []);

  const handleRefunded = useCallback(() => {
    setRefundSaleId(null);
    refetch();
  }, [refetch]);

  const handleReceiptScan = useCallback((barcode: string) => {
    const value = barcode.trim();
    setSearchText(value);
    setScanModalVisible(false);
    return true;
  }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Returns" />
      <View style={styles.returnsContent}>
        <View style={styles.returnSearchBox}>
          <Icon name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.returnSearchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Receipt, sale number, or customer"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <Icon name="close" size={17} color={colors.text.secondary} />
            </Pressable>
          )}
          <Pressable onPress={() => setScanModalVisible(true)} hitSlop={8} style={styles.searchScanButton}>
            <Icon name="barcode" size={18} color={colors.accent.primary} />
          </Pressable>
        </View>

        <Text style={styles.returnHint}>
          {searchText ? 'Search results' : 'Refundable sales from today'}
        </Text>

        {isLoading ? (
          <View style={styles.returnLoading}>
            <ActivityIndicator color={colors.accent.primary} />
          </View>
        ) : visibleSales.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="No Sales Found"
            body="Search by receipt or sale number to start a return."
          />
        ) : (
          <ScrollView contentContainerStyle={styles.returnList}>
            {visibleSales.map(sale => {
              const disabled = !isRefundableStatus(sale.status);
              return (
                <Pressable
                  key={sale.id}
                  style={[styles.returnCard, disabled && styles.returnCardDisabled]}
                  onPress={() => openRefund(sale)}
                  disabled={disabled}
                  android_ripple={!disabled ? { color: colors.accent.glow } : undefined}
                >
                  <View style={styles.returnCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.returnSaleNo}>{sale.saleNo}</Text>
                      <Text style={styles.returnMeta}>
                        {sale.customerName || 'Walk-in'} / {fmtTxnTime(sale.completedAt || sale.createdAt)}
                      </Text>
                    </View>
                    <Text style={styles.returnTotal}>{fmtPHP(parseFloat(sale.grandTotal))}</Text>
                  </View>
                  <View style={styles.returnCardBottom}>
                    <Text style={[styles.returnStatus, disabled && styles.returnStatusDisabled]}>
                      {disabled ? 'Fully refunded' : sale.status === 'PARTIALLY_REFUNDED' ? 'Partial refund' : 'Refundable'}
                    </Text>
                    {!disabled && (
                      <View style={styles.returnAction}>
                        <Text style={styles.returnActionText}>Start Return</Text>
                        <Icon name="chevron-right" size={16} color={colors.accent.primary} />
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {refundSale && (
        <RefundFlow
          visible={refundSaleId !== null}
          onClose={() => setRefundSaleId(null)}
          saleId={refundSale.id}
          saleNo={refundSale.saleNo}
          lines={refundSale.lines.map(l => ({
            id: l.id,
            productName: l.productName,
            sku: l.mnemonicSku,
            quantity: l.quantity,
            refundedQuantity: l.refundedQuantity ?? 0,
            unitPrice: parseFloat(l.unitPrice),
            lineTotal: parseFloat(l.lineTotal),
          }))}
          onRefunded={handleRefunded}
          verifyAuthorization={verifyRefundAuthorizationCredential}
        />
      )}
      <BarcodeScanModal
        visible={scanModalVisible}
        title="Scan Receipt"
        subtitle="Scan a receipt barcode or type the sale number to start a return."
        placeholder="Receipt or sale number"
        actionLabel="Find Sale"
        onSubmit={handleReceiptScan}
        onClose={() => setScanModalVisible(false)}
      />
    </View>
  );
}

export function BarcodePrintScreen() {
  const { query, setQuery, results, isSearching, searchByBarcode } = useCatalogSearch();
  const printer = usePrinter();
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [labelCopies, setLabelCopies] = useState(1);
  const styles = createStyles();

  const buildItemLabelZpl = useCallback((item: CatalogItem, copies = labelCopies) => {
    const label = buildShelfLabel({
      itemName: item.name,
      barcode: item.barcode,
      sku: item.sku || item.mnemonicSku,
      price: item.unitPrice,
    });
    return Array.from({ length: clampLabelCopies(copies) }, () => label).join('');
  }, [labelCopies]);

  const handlePrint = useCallback(async (item: CatalogItem) => {
    if (!item.barcode) {
      Alert.alert('No Barcode', 'This product does not have a barcode to print.');
      return;
    }

    setPrintingId(item.serverId);
    try {
      const result = await printZplSafely(printer, buildItemLabelZpl(item), {
        type: 'barcode-label',
        title: `Label ${item.sku || item.name}`,
        sourceId: item.serverId,
      });

      if (!result.success) {
        Alert.alert('Label Not Printed', result.error || 'Connect a ZPL label printer before printing.', [
          { text: 'Preview Label', onPress: () => setPreviewItem(item) },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Label Sent', `${pluralize(labelCopies, 'label')} for ${item.sku || item.name} sent to the printer.`);
      }
    } catch (err: any) {
      Alert.alert('Print Failed', formatPosError(err, 'Label could not be printed.'));
    } finally {
      setPrintingId(null);
    }
  }, [buildItemLabelZpl, labelCopies, printer]);

  const handleScanSubmit = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    setQuery(code);
    const item = await searchByBarcode(code);

    if (!item) {
      Alert.alert('No Product Found', `No product was found for barcode ${code}.`);
      return false;
    }

    if (!item.barcode) {
      Alert.alert('No Barcode', `${item.name} does not have a barcode to print.`);
      return false;
    }

    setPreviewItem(item);
    return true;
  }, [searchByBarcode, setQuery]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Barcode Print" />
      <View style={styles.returnsContent}>
        <View style={styles.returnSearchBox}>
          <Icon name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.returnSearchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search product, SKU, or barcode"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close" size={17} color={colors.text.secondary} />
            </Pressable>
          )}
        </View>

        <Text style={styles.returnHint}>
          {query ? 'Matching products' : 'Search for a product to print a shelf label'}
        </Text>

        <View style={styles.priceToolbar}>
          <Button
            title="Scan Barcode"
            onPress={() => setScanModalVisible(true)}
            variant="secondary"
            style={styles.priceToolbarButton}
          />
          <Text style={styles.scanStatusText} numberOfLines={1}>
            Hardware scanner or manual barcode input
          </Text>
        </View>

        <View style={styles.labelControlCard}>
          <View style={styles.labelControlCopy}>
            <Text style={styles.labelControlTitle}>Print Quantity</Text>
            <Text style={styles.labelControlText}>
              Applies to preview and print actions for every selected item.
            </Text>
          </View>
          <View style={styles.copyStepper}>
            <Pressable
              style={[styles.copyStepButton, labelCopies <= 1 && styles.copyStepButtonDisabled]}
              onPress={() => setLabelCopies(value => clampLabelCopies(value - 1))}
              disabled={labelCopies <= 1}
            >
              <Text style={styles.copyStepText}>-</Text>
            </Pressable>
            <Text style={styles.copyCountText}>{labelCopies}</Text>
            <Pressable
              style={[styles.copyStepButton, labelCopies >= 10 && styles.copyStepButtonDisabled]}
              onPress={() => setLabelCopies(value => clampLabelCopies(value + 1))}
              disabled={labelCopies >= 10}
            >
              <Text style={styles.copyStepText}>+</Text>
            </Pressable>
          </View>
        </View>

        {isSearching ? (
          <View style={styles.returnLoading}>
            <ActivityIndicator color={colors.accent.primary} />
          </View>
        ) : results.length === 0 ? (
          <EmptyState
            icon="barcode"
            title="No Products Found"
            body="Search by product name, SKU, or barcode."
          />
        ) : (
          <ScrollView contentContainerStyle={styles.returnList}>
            {results.map(item => {
              const printing = printingId === item.serverId;
              return (
                <View key={item.id} style={styles.labelCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.returnSaleNo} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.returnMeta} numberOfLines={1}>
                      {item.sku || 'No SKU'} / {item.barcode || 'No barcode'}
                    </Text>
                    <Text style={styles.labelCardMeta} numberOfLines={1}>
                      {fmtPHP(item.unitPrice)} / {pluralize(labelCopies, 'label')} ready
                    </Text>
                  </View>
                  <View style={styles.labelActions}>
                    <Pressable
                      style={[styles.previewLabelButton, !item.barcode && styles.printLabelButtonDisabled]}
                      onPress={() => setPreviewItem(item)}
                      disabled={!item.barcode}
                      android_ripple={{ color: colors.accent.glow }}
                    >
                      <Icon name="tag" size={16} color={colors.accent.primary} />
                      <Text style={styles.previewLabelText}>Preview</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.printLabelButton, (!item.barcode || printing) && styles.printLabelButtonDisabled]}
                      onPress={() => handlePrint(item)}
                      disabled={!item.barcode || printing}
                      android_ripple={{ color: colors.accent.glow }}
                    >
                      {printing ? (
                        <ActivityIndicator size="small" color={colors.text.inverse} />
                      ) : (
                        <>
                          <Icon name="barcode" size={16} color={colors.text.inverse} />
                          <Text style={styles.printLabelText}>Print</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
      {previewItem?.barcode ? (
        <LabelPreviewModal
          visible={Boolean(previewItem)}
          itemName={previewItem.name}
          sku={previewItem.sku || previewItem.mnemonicSku}
          barcode={previewItem.barcode}
          price={previewItem.unitPrice}
          copies={labelCopies}
          zpl={buildItemLabelZpl(previewItem)}
          onClose={() => setPreviewItem(null)}
          onPrint={() => handlePrint(previewItem)}
          printing={printingId === previewItem.serverId}
          statusLabel={printer.isConnected ? undefined : 'Connect a ZPL label printer before printing.'}
        />
      ) : null}
      <BarcodeScanModal
        visible={scanModalVisible}
        title="Scan Label Barcode"
        subtitle="Scan or type a product barcode to open the label preview."
        actionLabel="Preview Label"
        onSubmit={handleScanSubmit}
        onClose={() => setScanModalVisible(false)}
      />
    </View>
  );
}

function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const styles = createStyles();
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.text.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function SyncMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const styles = createStyles();
  return (
    <View style={styles.syncMetricCard}>
      <Text style={styles.syncMetricLabel}>{label}</Text>
      <Text
        style={[
          styles.syncMetricValue,
          tone === 'success' && styles.textSuccess,
          tone === 'warning' && styles.textWarning,
          tone === 'danger' && styles.textDanger,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SyncCheckRow({
  label,
  detail,
  ready,
  warning = false,
}: {
  label: string;
  detail: string;
  ready: boolean;
  warning?: boolean;
}) {
  const styles = createStyles();
  const color = ready ? colors.status.success : warning ? colors.status.warning : colors.status.danger;
  return (
    <View style={styles.syncCheckRow}>
      <View style={[styles.syncCheckDot, { backgroundColor: color }]} />
      <View style={styles.syncCheckCopy}>
        <Text style={styles.syncCheckLabel}>{label}</Text>
        <Text
          style={[
            styles.syncCheckDetail,
            ready && styles.textSuccess,
            warning && !ready && styles.textWarning,
            !warning && !ready && styles.textDanger,
          ]}
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

function HardwareTestButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = createStyles();
  return (
    <Pressable
      style={[styles.hardwareTestButton, disabled && styles.hardwareTestButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors.accent.glow }}
      accessibilityLabel={label}
    >
      <Text style={styles.hardwareTestButtonText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({
  label,
  value,
  warning = false,
  tone = 'default',
}: {
  label: string;
  value: string;
  warning?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const styles = createStyles();
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          (warning || tone === 'warning') && styles.infoWarning,
          tone === 'success' && styles.textSuccess,
          tone === 'danger' && styles.textDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 72,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  headerTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 90,
  },
  parkedSummaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  parkedMetricCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  parkedMetricLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  parkedMetricValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
    marginTop: 2,
  },
  parkedMetricValuePrimary: {
    color: colors.accent.primary,
  },
  returnsContent: {
    flex: 1,
    padding: spacing.lg,
  },
  priceManagementContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  returnSearchBox: {
    minHeight: 50,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  returnSearchInput: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.base,
  },
  searchScanButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnHint: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  returnLoading: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnList: {
    paddingBottom: 90,
    gap: spacing.md,
  },
  returnCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
  },
  returnCardDisabled: {
    opacity: 0.55,
  },
  returnCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  returnSaleNo: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  returnMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 3,
  },
  returnTotal: {
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  returnCardBottom: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  returnStatus: {
    color: colors.status.success,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  returnStatusDisabled: {
    color: colors.text.muted,
  },
  returnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  returnActionText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  labelCard: {
    minHeight: 76,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  labelCardMeta: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    marginTop: 3,
  },
  labelControlCard: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  labelControlCopy: {
    flex: 1,
    minWidth: 0,
  },
  labelControlTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
  },
  labelControlText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 3,
  },
  copyStepper: {
    minWidth: 128,
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  copyStepButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.surface,
  },
  copyStepButtonDisabled: {
    opacity: 0.42,
  },
  copyStepText: {
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  copyCountText: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
    minWidth: 34,
    textAlign: 'center',
  },
  labelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  previewLabelButton: {
    minWidth: 88,
    minHeight: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  previewLabelText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  printLabelButton: {
    minWidth: 82,
    minHeight: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
  },
  printLabelButtonDisabled: {
    opacity: 0.5,
  },
  printLabelText: {
    color: colors.text.inverse,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  segmentRow: {
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
    marginBottom: spacing.md,
  },
  segmentButton: {
    flex: 1,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentButtonActive: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  segmentText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  segmentTextActive: {
    color: colors.accent.primary,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  sectionBody: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.base,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  reportHero: {
    minHeight: 132,
    borderRadius: radius.md,
    backgroundColor: colors.accent.primary,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  reportHeroLabel: {
    color: colors.white,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    opacity: 0.84,
  },
  reportHeroValue: {
    color: colors.white,
    fontFamily: fonts.display.extraBold,
    fontSize: fontSize['4xl'],
    marginTop: 3,
  },
  reportHeroDelta: {
    color: colors.white,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    opacity: 0.82,
    marginTop: 4,
  },
  reportHeroBadge: {
    width: 92,
    minHeight: 82,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportHeroBadgeValue: {
    color: colors.white,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
  },
  reportHeroBadgeLabel: {
    color: colors.white,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    opacity: 0.82,
  },
  reportMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reportMetricCard: {
    width: '48.5%',
    minHeight: 86,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  reportMetricLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  reportMetricValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  textSuccess: {
    color: colors.status.success,
  },
  textWarning: {
    color: colors.status.warning,
  },
  textDanger: {
    color: colors.status.danger,
  },
  reportSection: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  paymentRow: {
    minHeight: 56,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  paymentMethod: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
  },
  paymentMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  paymentAmount: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  topItemRow: {
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.sm,
  },
  topItemName: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
  },
  topItemMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  topItemAmount: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
  },
  noticeCard: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.status.warningBg,
    borderWidth: 1,
    borderColor: colors.status.warning,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  successNoticeCard: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.status.successBg,
    borderWidth: 1,
    borderColor: colors.status.success,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  noticeText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  priceToolbar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  priceToolbarButton: {
    minWidth: 154,
  },
  scanStatusText: {
    flex: 1,
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  pricingGuardCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pricingGuardItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pricingGuardIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricingGuardCopy: {
    flex: 1,
    minWidth: 0,
  },
  pricingGuardLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  pricingGuardValue: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  priceEditorCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  priceEditorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  priceQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  priceQuickChip: {
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceQuickChipDisabled: {
    opacity: 0.5,
  },
  priceQuickText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  priceInputRow: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceInputPrefix: {
    color: colors.text.muted,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  priceInput: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    paddingVertical: 0,
  },
  warningText: {
    color: colors.status.warning,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  productResultCard: {
    minHeight: 82,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  productResultActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  productPriceBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  productPrice: {
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  productStock: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  heldCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  heldTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heldTitleBlock: {
    flex: 1,
  },
  heldTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  heldMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  heldTotal: {
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  heldPreview: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: 4,
  },
  heldContext: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 3,
  },
  heldContextText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  heldLine: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
  },
  heldLineMuted: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  heldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  deleteButton: {
    width: 54,
    height: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.status.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncHealthCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  syncHealth_success: {
    borderColor: colors.status.success,
  },
  syncHealth_warning: {
    borderColor: colors.status.warning,
  },
  syncHealth_danger: {
    borderColor: colors.status.danger,
  },
  syncHealthHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  syncHealthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  syncHealthTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  syncHealthSubtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  syncHealthBadge: {
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBadge_success: {
    backgroundColor: colors.status.successBg,
    borderColor: colors.status.success,
  },
  syncBadge_warning: {
    backgroundColor: colors.status.warningBg,
    borderColor: colors.status.warning,
  },
  syncBadge_danger: {
    backgroundColor: colors.status.dangerBg,
    borderColor: colors.status.danger,
  },
  syncHealthBadgeText: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  syncBadgeText_success: {
    color: colors.status.successText,
  },
  syncBadgeText_warning: {
    color: colors.status.warningText,
  },
  syncBadgeText_danger: {
    color: colors.status.dangerText,
  },
  syncMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  syncMetricCard: {
    width: '48.5%',
    minHeight: 62,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  syncMetricLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  syncMetricValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
    marginTop: 2,
  },
  syncErrorCard: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.status.danger,
    backgroundColor: colors.status.dangerBg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  syncErrorText: {
    flex: 1,
    color: colors.status.dangerText,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  syncChecklistCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  syncChecklistTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  syncChecklistHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  syncChecklistSubtitle: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  readinessCountPill: {
    minHeight: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.status.danger,
    backgroundColor: colors.status.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  readinessCountText: {
    color: colors.status.dangerText,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
  },
  syncCheckRow: {
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  syncCheckDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  syncCheckCopy: {
    flex: 1,
    minWidth: 0,
  },
  syncCheckLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  syncCheckDetail: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  pendingReviewCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  pendingReviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pendingReviewTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  pendingReviewSubtitle: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 3,
  },
  pendingReviewBadge: {
    minWidth: 42,
    minHeight: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.status.warningBg,
    borderWidth: 1,
    borderColor: colors.status.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pendingReviewBadgeText: {
    color: colors.status.warningText,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.base,
  },
  pendingReviewMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pendingReviewRows: {
    gap: spacing.sm,
  },
  hardwareButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hardwareTestButton: {
    minHeight: 40,
    minWidth: '31%',
    flexGrow: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  hardwareTestButtonDisabled: {
    opacity: 0.45,
  },
  hardwareTestButtonText: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  hardwareResultRow: {
    minHeight: 58,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pendingSaleRow: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pendingSaleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pendingSaleDotWarning: {
    backgroundColor: colors.status.warning,
  },
  pendingSaleDotDanger: {
    backgroundColor: colors.status.danger,
  },
  pendingSaleDotInfo: {
    backgroundColor: colors.status.info,
  },
  pendingSaleCopy: {
    flex: 1,
    minWidth: 0,
  },
  pendingSaleTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  pendingSaleDetail: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  pendingSaleMeta: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  pendingSaleAmount: {
    color: colors.text.primary,
    fontFamily: fonts.mono.medium,
    fontSize: fontSize.sm,
  },
  pendingSaleStatus: {
    color: colors.text.muted,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  emptyInlineText: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  printJobRow: {
    minHeight: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  printJobError: {
    color: colors.status.dangerText,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  printJobMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  retryPrintButton: {
    minWidth: 78,
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  retryPrintButtonDisabled: {
    opacity: 0.5,
  },
  retryPrintButtonText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  clearPrintedButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  clearPrintedText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  infoCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  infoRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
  },
  infoValue: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
    flexShrink: 1,
    textAlign: 'right',
  },
  infoWarning: {
    color: colors.status.warning,
  },
  progressCard: {
    marginTop: spacing.md,
    backgroundColor: colors.accent.muted,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  progressTitle: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  progressText: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
    marginTop: 2,
  },
  actionStack: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  diagnosticsCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  diagnosticsGrid: {
    gap: spacing.xs,
  },
  diagnosticsText: {
    color: colors.text.secondary,
    fontFamily: fonts.mono.regular,
    fontSize: fontSize.xs,
    lineHeight: 18,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  emptyState: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  emptyBody: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.base,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  aboutContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  aboutLogo: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  aboutLogoText: {
    color: colors.white,
    fontFamily: fonts.display.extraBold,
    fontSize: fontSize['5xl'],
  },
  aboutTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['3xl'],
  },
  aboutSubtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
