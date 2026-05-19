import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { apiFetch } from '@/services/api-client';
import { queryClient } from '@/services/query-client';
import { colors, fonts, layout, radius, spacing, textStyles } from '@/theme';
import { Icon, Button } from '@/components/ui';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { reconcilePendingSales } from '@/hooks/use-checkout';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { useActiveShiftQuery, useShiftListQuery, useZReadingQuery, type ShiftListItem } from '@/hooks/use-shift';
import { getPendingSales } from '@/storage/pending-sales';
import {
  getUnsyncedRegisterDrawerEventsForShift,
  summarizeRegisterDrawerEvents,
} from '@/storage/register-drawer-events';
import { formatApiDateTime, parseApiDate } from '@/utils/datetime';
import { summarizePendingSales, type PendingSaleSummary } from '@/utils/pending-sale-summary';
import { formatPosError } from '@/utils/pos-error-messages';

type StatusFilter = 'ALL' | ShiftListItem['status'];
type RangeFilter = 'ALL' | 'TODAY' | '7D' | '30D';

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Force Closed', value: 'FORCE_CLOSED' },
];

const RANGE_FILTERS: Array<{ label: string; value: RangeFilter }> = [
  { label: 'All Dates', value: 'ALL' },
  { label: 'Today', value: 'TODAY' },
  { label: '7 Days', value: '7D' },
  { label: '30 Days', value: '30D' },
];

interface ForceCloseBlockers {
  pendingSummary: PendingSaleSummary;
  drawerSummary: ReturnType<typeof summarizeRegisterDrawerEvents>;
}

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

function fmtDateTime(value: string | null | undefined): string {
  return formatApiDateTime(value, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeZReadingDrawerEvents(zReading: ReturnType<typeof useZReadingQuery>['data']) {
  const events = zReading?.accountability.drawerEvents ?? [];
  return events.reduce(
    (summary, event) => {
      const amount = toNumber(event.amount);
      summary.count += 1;
      if (event.type === 'PAID_IN') {
        summary.paidIn += amount;
        summary.net += amount;
      } else if (event.type === 'PAID_OUT') {
        summary.paidOut += amount;
        summary.net -= amount;
      }
      return summary;
    },
    { count: 0, paidIn: 0, paidOut: 0, net: 0 },
  );
}

function getForceCloseBlockers(shiftId: string, activeShiftId: string | null | undefined): ForceCloseBlockers {
  const pendingSales = !activeShiftId || activeShiftId === shiftId ? getPendingSales() : [];
  const drawerEvents = getUnsyncedRegisterDrawerEventsForShift(shiftId);

  return {
    pendingSummary: summarizePendingSales(pendingSales),
    drawerSummary: summarizeRegisterDrawerEvents(drawerEvents),
  };
}

function hasForceCloseBlockers(blockers: ForceCloseBlockers): boolean {
  return blockers.pendingSummary.total > 0 || blockers.drawerSummary.eventCount > 0;
}

function getRangeStart(filter: RangeFilter): string | undefined {
  if (filter === 'ALL') return undefined;

  const date = new Date();
  if (filter === 'TODAY') {
    date.setHours(0, 0, 0, 0);
  } else if (filter === '7D') {
    date.setDate(date.getDate() - 7);
  } else if (filter === '30D') {
    date.setDate(date.getDate() - 30);
  }
  return date.toISOString();
}

function statusTone(status: ShiftListItem['status']) {
  if (status === 'OPEN') {
    return { bg: colors.status.successBg, text: colors.status.successText, border: colors.status.success };
  }
  if (status === 'FORCE_CLOSED') {
    return { bg: colors.status.dangerBg, text: colors.status.dangerText, border: colors.status.danger };
  }
  return { bg: colors.bg.elevated, text: colors.text.secondary, border: colors.border.default };
}

function matchesSearch(shift: ShiftListItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    shift.id,
    shift.status,
    shift.cashierName,
    shift.locationName,
    shift.notes ?? '',
    fmtPHP(shift.netSales ?? shift.grossSales),
    shift.drawerEventCount ? `${shift.drawerEventCount} drawer events` : '',
    fmtPHP(shift.drawerNetCash ?? 0),
    fmtDateTime(shift.openedAt),
    fmtDateTime(shift.closedAt),
  ].join(' ').toLowerCase();

  return haystack.includes(normalized);
}

export default function ShiftHistoryScreen() {
  const navigation = useNavigation<any>();
  const { can, requiredLevel } = usePosPermission();
  const canManageShifts = can('zReading');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('ALL');
  const [forceShift, setForceShift] = useState<ShiftListItem | null>(null);
  const [forceClosing, setForceClosing] = useState(false);
  const [reconcilingBeforeForceClose, setReconcilingBeforeForceClose] = useState(false);
  const styles = createStyles();

  const listParams = useMemo(() => ({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    from: getRangeStart(rangeFilter),
  }), [rangeFilter, statusFilter]);

  const {
    data,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useShiftListQuery(canManageShifts, listParams);
  const { data: activeShift } = useActiveShiftQuery();
  const { data: activeZReading } = useZReadingQuery(activeShift?.id ?? '');
  const activeDrawerSummary = useMemo(
    () => summarizeZReadingDrawerEvents(activeZReading),
    [activeZReading],
  );

  const activeFallbackShift = useMemo<ShiftListItem | null>(() => {
    if (!activeShift) return null;
    if (statusFilter !== 'ALL' && statusFilter !== 'OPEN') return null;

    const rangeStart = getRangeStart(rangeFilter);
    const openedAt = parseApiDate(activeShift.openedAt);
    if (rangeStart && openedAt && openedAt < new Date(rangeStart)) return null;

    return {
      id: activeShift.id,
      status: 'OPEN',
      openedAt: activeShift.openedAt,
      closedAt: null,
      openingFloat: activeShift.openingFloat,
      actualCash: null,
      cashVariance: null,
      notes: null,
      cashierName: activeShift.cashierName,
      locationName: activeShift.locationName,
      grossSales: activeZReading?.salesSummary.grossSales ?? '0',
      refundsTotal: activeZReading?.salesSummary.refundsTotal ?? '0',
      netSales: activeZReading?.salesSummary.netSales ?? '0',
      transactionCount: activeZReading?.salesSummary.transactionCount ?? 0,
      voidCount: activeZReading?.salesSummary.voidCount ?? 0,
      drawerEventCount: activeDrawerSummary.count,
      drawerPaidInTotal: activeDrawerSummary.paidIn.toFixed(2),
      drawerPaidOutTotal: activeDrawerSummary.paidOut.toFixed(2),
      drawerNetCash: activeDrawerSummary.net.toFixed(2),
    };
  }, [activeDrawerSummary, activeShift, activeZReading, rangeFilter, statusFilter]);

  const loadedShifts = useMemo(() => {
    const serverShifts = data?.data ?? [];
    if (!activeFallbackShift) return serverShifts;
    if (serverShifts.some((shift) => shift.id === activeFallbackShift.id)) return serverShifts;
    return [activeFallbackShift, ...serverShifts];
  }, [activeFallbackShift, data?.data]);
  const shifts = useMemo(
    () => loadedShifts.filter((shift) => matchesSearch(shift, searchQuery)),
    [loadedShifts, searchQuery],
  );

  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== 'ALL' || rangeFilter !== 'ALL';

  const totals = useMemo(() => {
    return shifts.reduce(
      (acc, shift) => {
        acc.netSales += toNumber(shift.netSales ?? shift.grossSales);
        const refundTotal = toNumber(shift.refundsTotal);
        acc.refunds += refundTotal;
        if (refundTotal > 0) acc.refundShifts += 1;
        acc.voids += shift.voidCount ?? 0;
        const drawerEventCount = shift.drawerEventCount ?? 0;
        acc.drawerEvents += drawerEventCount;
        if (drawerEventCount > 0) acc.drawerShifts += 1;
        const variance = shift.cashVariance === null || shift.cashVariance === undefined
          ? null
          : toNumber(shift.cashVariance);
        if (variance !== null && Math.abs(variance) >= 1) acc.varianceFlags += 1;
        if (shift.status === 'OPEN') acc.open += 1;
        if (shift.status !== 'OPEN') acc.closed += 1;
        return acc;
      },
      { netSales: 0, refunds: 0, refundShifts: 0, voids: 0, varianceFlags: 0, drawerEvents: 0, drawerShifts: 0, open: 0, closed: 0 },
    );
  }, [shifts]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setRangeFilter('ALL');
  }, []);

  const openReading = useCallback((shift: ShiftListItem) => {
    navigation.navigate('ShiftZReading', {
      shiftId: shift.id,
      mode: shift.status === 'OPEN' ? 'view' : 'snapshot',
    });
  }, [navigation]);

  const confirmForceClose = useCallback((shift: ShiftListItem) => {
    Alert.alert(
      'Force Close Shift',
      `Force close ${shift.cashierName}'s open shift at ${shift.locationName}? This freezes the Z-reading for audit review.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => setForceShift(shift) },
      ],
    );
  }, []);

  const reconcilePendingBeforeForceClose = useCallback(async (shift: ShiftListItem) => {
    if (reconcilingBeforeForceClose) return;

    setReconcilingBeforeForceClose(true);
    try {
      const summary = await reconcilePendingSales();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['shifts', 'z-reading', shift.id] });
      await refetch();

      const remaining = getForceCloseBlockers(shift.id, activeShift?.id);
      if (summary.blockedReason === 'store_lock') {
        Alert.alert(
          'Store Lock Required',
          'This tablet must be locked to a store before pending sales can sync. Force close remains blocked.',
        );
      } else if (remaining.pendingSummary.total > 0) {
        Alert.alert(
          'Pending Sales Remain',
          `${remaining.pendingSummary.total} pending sale(s) still need manager review or connectivity before this shift can be force-closed.`,
        );
      } else if (remaining.drawerSummary.eventCount > 0) {
        Alert.alert(
          'Drawer Events Still Local',
          `${remaining.drawerSummary.eventCount} drawer event(s) must sync from Z-reading before force close can continue.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Z-Reading',
              onPress: () => navigation.navigate('ShiftZReading', { shiftId: shift.id, mode: 'close' }),
            },
          ],
        );
      } else {
        Alert.alert(
          'Pending Sales Synced',
          'Local sales are clear. Continue with force close when ready.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue Force Close', style: 'destructive', onPress: () => confirmForceClose(shift) },
          ],
        );
      }
    } catch (err: any) {
      Alert.alert('Reconciliation Failed', formatPosError(err, 'Unable to process pending sales before force close.'));
    } finally {
      setReconcilingBeforeForceClose(false);
    }
  }, [activeShift?.id, confirmForceClose, navigation, reconcilingBeforeForceClose, refetch]);

  const showForceCloseBlockers = useCallback((shift: ShiftListItem, blockers: ForceCloseBlockers): boolean => {
    if (blockers.pendingSummary.total > 0) {
      Alert.alert(
        'Sync Pending Sales First',
        `${blockers.pendingSummary.total} pending sale(s) totaling ${fmtPHP(blockers.pendingSummary.totalPayments)} are still stored on this tablet. Oldest: ${blockers.pendingSummary.oldestAgeLabel}. Force close is blocked until they sync or receive manager review.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Sync', onPress: () => navigation.navigate('SyncManagement') },
          {
            text: reconcilingBeforeForceClose ? 'Reconciling...' : 'Reconcile Sales',
            onPress: () => {
              void reconcilePendingBeforeForceClose(shift);
            },
          },
        ],
      );
      return true;
    }

    if (blockers.drawerSummary.eventCount > 0) {
      Alert.alert(
        'Sync Drawer Events First',
        `${blockers.drawerSummary.eventCount} local drawer event(s) are waiting for this shift. Drawer net is ${fmtSignedPHP(blockers.drawerSummary.netCash)}. Open Z-reading to sync the audit log before force close.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Z-Reading',
            onPress: () => navigation.navigate('ShiftZReading', { shiftId: shift.id, mode: 'close' }),
          },
        ],
      );
      return true;
    }

    return false;
  }, [navigation, reconcilePendingBeforeForceClose, reconcilingBeforeForceClose]);

  const startForceClose = useCallback((shift: ShiftListItem) => {
    const blockers = getForceCloseBlockers(shift.id, activeShift?.id);
    if (showForceCloseBlockers(shift, blockers)) return;
    confirmForceClose(shift);
  }, [activeShift?.id, confirmForceClose, showForceCloseBlockers]);

  const submitForceClose = useCallback(async (approval?: ManagerAuthorization) => {
    if (!forceShift) return false;
    if (!approval?.credential) {
      Alert.alert('Authorization Required', 'Scan a manager barcode, swipe a manager card, or enter a manager PIN.');
      return false;
    }
    const blockers = getForceCloseBlockers(forceShift.id, activeShift?.id);
    if (hasForceCloseBlockers(blockers)) {
      setForceShift(null);
      showForceCloseBlockers(forceShift, blockers);
      return false;
    }
    setForceClosing(true);
    try {
      await apiFetch(`/shifts/${forceShift.id}/force-close`, {
        method: 'POST',
        requireLockedLocation: true,
        body: JSON.stringify({
          authorizationCredential: approval.credential,
          authorizationMethod: approval.method,
        }),
      });
      setForceShift(null);
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['shifts', 'z-reading', forceShift.id] });
      await refetch();
      Alert.alert('Shift Force-Closed', 'The Z-reading snapshot has been frozen for audit review.');
      return true;
    } catch (err: any) {
      Alert.alert('Force Close Failed', formatPosError(err, 'Unable to force-close this shift.'));
      return false;
    } finally {
      setForceClosing(false);
    }
  }, [activeShift?.id, forceShift, refetch, showForceCloseBlockers]);

  const handleForceCloseApproved = useCallback((
    _approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    void submitForceClose(approval);
  }, [submitForceClose]);

  if (!canManageShifts) {
    return (
      <View style={styles.container}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>Manager access required</Text>
          <Text style={styles.emptyText}>Shift history and Z-reading audit tools require manager access.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header onBack={() => navigation.goBack()} />

      <View style={styles.metrics}>
        <Metric label="Open" value={String(totals.open)} />
        <Metric label="Closed" value={String(totals.closed)} />
        <Metric label="Exceptions" value={String(totals.voids + totals.varianceFlags + totals.refundShifts + totals.drawerShifts)} />
        <Metric label="Net Sales" value={fmtPHP(totals.netSales)} wide />
      </View>

      <AuditFilters
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        rangeFilter={rangeFilter}
        resultCount={shifts.length}
        loadedCount={loadedShifts.length}
        hasMore={!!data?.hasMore}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearchQuery}
        onStatusChange={setStatusFilter}
        onRangeChange={setRangeFilter}
        onClear={clearFilters}
      />

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.emptyText}>Loading shifts...</Text>
        </View>
      ) : isError ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>Unable to load shifts</Text>
          <Text style={styles.emptyText}>{error instanceof Error ? error.message : 'Try refreshing the audit list.'}</Text>
          <Button title="Retry" onPress={() => refetch()} variant="secondary" style={styles.retryButton} />
        </View>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Text style={styles.emptyTitle}>{hasActiveFilters ? 'No matching shifts' : 'No shifts yet'}</Text>
              <Text style={styles.emptyText}>
                {hasActiveFilters ? 'Try another search, status, or date filter.' : 'Completed register sessions will appear here.'}
              </Text>
              {hasActiveFilters && (
                <Button title="Clear Filters" onPress={clearFilters} variant="secondary" style={styles.retryButton} />
              )}
            </View>
          }
          ListFooterComponent={
            data?.hasMore ? (
              <Text style={styles.footerNote}>
                More shifts match the server filters. Narrow the date or status to review older records.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ShiftRow
              shift={item}
              onOpenReading={() => openReading(item)}
              onForceClose={() => startForceClose(item)}
            />
          )}
        />
      )}

      <ManagerPinModal
        visible={forceShift !== null}
        action={forceShift ? `Force close ${forceShift.cashierName}'s shift at ${forceShift.locationName}` : 'Force close shift'}
        requiredLevel={requiredLevel('zReading')}
        onApprove={handleForceCloseApproved}
        onCancel={() => {
          if (!forceClosing) setForceShift(null);
        }}
      />
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const styles = createStyles();
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack} android_ripple={{ color: colors.accent.glow }}>
        <Icon name="chevron-left" size={22} color={colors.text.primary} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.title}>Shift History</Text>
        <Text style={styles.subtitle}>Shift closeout audit trail</Text>
      </View>
    </View>
  );
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  const styles = createStyles();
  return (
    <View style={[styles.metric, wide && styles.metricWide]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function AuditFilters({
  searchQuery,
  statusFilter,
  rangeFilter,
  resultCount,
  loadedCount,
  hasMore,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onRangeChange,
  onClear,
}: {
  searchQuery: string;
  statusFilter: StatusFilter;
  rangeFilter: RangeFilter;
  resultCount: number;
  loadedCount: number;
  hasMore: boolean;
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onRangeChange: (value: RangeFilter) => void;
  onClear: () => void;
}) {
  const styles = createStyles();
  return (
    <View style={styles.filterPanel}>
      <View style={styles.searchBox}>
        <Icon name="search" size={20} color={colors.text.muted} />
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search cashier, location, amount, or shift ID"
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {searchQuery.trim().length > 0 && (
          <Pressable
            style={styles.clearSearchButton}
            onPress={() => onSearchChange('')}
            accessibilityLabel="Clear search"
          >
            <Icon name="close" size={18} color={colors.text.secondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Status</Text>
        <View style={styles.chipRow}>
          {STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              active={statusFilter === filter.value}
              onPress={() => onStatusChange(filter.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Date</Text>
        <View style={styles.chipRow}>
          {RANGE_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              active={rangeFilter === filter.value}
              onPress={() => onRangeChange(filter.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.resultLine}>
        <Text style={styles.resultText}>
          Showing {resultCount} of {loadedCount}{hasMore ? '+' : ''} loaded shifts
        </Text>
        {hasActiveFilters && (
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clearFiltersText}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = createStyles();
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      android_ripple={{ color: colors.accent.glow }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function ShiftRow({
  shift,
  onOpenReading,
  onForceClose,
}: {
  shift: ShiftListItem;
  onOpenReading: () => void;
  onForceClose: () => void;
}) {
  const styles = createStyles();
  const tone = statusTone(shift.status);
  const isOpen = shift.status === 'OPEN';
  const netSales = shift.netSales ?? shift.grossSales;
  const refunds = toNumber(shift.refundsTotal);
  const variance = shift.cashVariance === null || shift.cashVariance === undefined ? null : toNumber(shift.cashVariance);
  const transactionCount = shift.transactionCount ?? 0;
  const voidCount = shift.voidCount ?? 0;
  const drawerEventCount = shift.drawerEventCount ?? 0;
  const drawerNetCash = toNumber(shift.drawerNetCash);
  const actionTitle = isOpen
    ? 'X-Reading'
    : shift.status === 'FORCE_CLOSED'
      ? 'Review Forced Z-Reading'
      : 'Review Z-Reading';

  return (
    <View style={styles.shiftCard}>
      <View style={styles.shiftHeader}>
        <View style={styles.shiftTitleBlock}>
          <Text style={styles.cashierName} numberOfLines={1}>{shift.cashierName}</Text>
          <Text style={styles.locationName} numberOfLines={1}>{shift.locationName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Text style={[styles.statusText, { color: tone.text }]}>{shift.status.replace('_', ' ')}</Text>
        </View>
      </View>

      <View style={styles.detailsGrid}>
        <Info label="Opened" value={fmtDateTime(shift.openedAt)} />
        <Info label="Closed" value={fmtDateTime(shift.closedAt)} />
        <Info label="Gross Sales" value={fmtPHP(shift.grossSales)} />
        <Info
          label="Refunds"
          value={refunds > 0 ? `-${fmtPHP(refunds)}` : fmtPHP(0)}
          tone={refunds > 0 ? 'danger' : 'default'}
        />
        <Info label="Net Sales" value={fmtPHP(netSales)} />
        <Info label="Transactions" value={`${transactionCount} sale${transactionCount === 1 ? '' : 's'}`} />
        <Info
          label="Voids"
          value={String(voidCount)}
          tone={voidCount > 0 ? 'danger' : 'default'}
        />
        <Info
          label="Cash Variance"
          value={variance === null ? '-' : fmtSignedPHP(variance)}
          tone={variance === null ? 'default' : Math.abs(variance) < 1 ? 'success' : 'danger'}
        />
        <Info
          label="Drawer Events"
          value={String(drawerEventCount)}
          tone={drawerEventCount > 0 ? 'warning' : 'default'}
        />
        <Info
          label="Drawer Net"
          value={fmtSignedPHP(drawerNetCash)}
          tone={Math.abs(drawerNetCash) > 0 ? 'warning' : 'default'}
        />
      </View>

      {shift.notes ? <Text style={styles.notes} numberOfLines={2}>{shift.notes}</Text> : null}

      <View style={styles.actions}>
        <Button
          title={actionTitle}
          onPress={onOpenReading}
          variant="secondary"
          style={styles.actionButton}
        />
        {isOpen && (
          <Button
            title="Force Close"
            onPress={onForceClose}
            variant="danger"
            style={styles.actionButton}
          />
        )}
      </View>
    </View>
  );
}

function Info({
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
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          tone === 'success' && styles.successText,
          tone === 'warning' && styles.warningText,
          tone === 'danger' && styles.dangerText,
        ]}
        numberOfLines={1}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.headerPaddingTop,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    backgroundColor: colors.bg.primary,
  },
  backButton: {
    minHeight: 48,
    minWidth: 88,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  backText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...textStyles.subheading,
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
  },
  subtitle: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  metric: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  metricWide: {
    flex: 1.5,
  },
  metricLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  metricValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    marginTop: 2,
  },
  filterPanel: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  searchBox: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.input,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    ...textStyles.body,
    color: colors.text.primary,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  clearSearchButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  filterSection: {
    marginTop: spacing.md,
  },
  filterLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.glow,
  },
  chipText: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
  },
  chipTextActive: {
    color: colors.accent.primary,
  },
  resultLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  resultText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  clearFiltersText: {
    ...textStyles.caption,
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
  },
  listContent: {
    padding: layout.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  emptyTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  retryButton: {
    marginTop: spacing.md,
    minWidth: 160,
  },
  shiftCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  shiftHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  shiftTitleBlock: {
    flex: 1,
  },
  cashierName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
  },
  locationName: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  statusText: {
    ...textStyles.captionSmall,
    fontFamily: fonts.body.semiBold,
    textTransform: 'uppercase',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  infoCell: {
    width: '48%',
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  infoLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  infoValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    marginTop: 2,
    fontSize: 12,
  },
  successText: {
    color: colors.status.successText,
  },
  warningText: {
    color: colors.status.warningText,
  },
  dangerText: {
    color: colors.status.dangerText,
  },
  notes: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  footerNote: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
