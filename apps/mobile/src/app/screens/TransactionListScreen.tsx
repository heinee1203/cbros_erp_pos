import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  Animated,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSalesListQuery, useSaleDetailQuery, getCachedTransactions, type SaleListItem } from '@/hooks/use-transactions';
import { useActiveShiftQuery } from '@/hooks/use-shift';
import { getPendingSales, onPendingSalesChanged } from '@/storage/pending-sales';
import { reconcilePendingSales } from '@/hooks/use-checkout';
import { useLayout } from '@/hooks/use-layout';
import { SplitView } from '@/components/SplitView';
import { TransactionDetailPane } from '@/components/TransactionDetailPane';
import { RefundFlow } from '@/components/RefundFlow';
import { VoidSaleSheet } from '@/components/VoidSaleSheet';
import { verifyRefundAuthorizationCredential } from '@/utils/refund-authorization';
import { formatApiDateTime } from '@/utils/datetime';
import { formatPosError } from '@/utils/pos-error-messages';
import { getPendingSaleReviewRows, summarizePendingSales } from '@/utils/pending-sale-summary';
import { colors, textStyles, spacing, layout, fonts, radius, touchTarget } from '@/theme';
import { useTheme } from '@/theme/ThemeContext';
import { Badge, Icon } from '@/components/ui';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { useAuth } from '@/hooks/use-auth';
import type { TransactionsStackParamList } from '@/app/MainTabs';

type Nav = StackNavigationProp<TransactionsStackParamList, 'TransactionList'>;

type TransactionQuickFilter = 'all' | 'completed' | 'attention' | 'account';

function fmtPHP(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `\u20B1${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(dateStr: string | null): string {
  return formatApiDateTime(dateStr, { hour: '2-digit', minute: '2-digit' });
}

function getBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'REFUNDED' || status === 'VOIDED') return 'danger';
  if (status === 'PARTIALLY_REFUNDED' || status === 'QUOTE' || status === 'OPEN' || status === 'PARKED') return 'warning';
  return 'success';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bRefunded\b/, 'Refunded');
}

export default function TransactionListScreen() {
  useTheme(); // Subscribe to theme changes for re-render
  const navigation = useNavigation<Nav>();
  const { isTablet, screenPadding } = useLayout();
  const { can } = usePosPermission();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<TransactionQuickFilter>('all');
  const [pendingSales, setPendingSales] = useState(() => getPendingSales());
  const [syncingPending, setSyncingPending] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const { data: allSales, isLoading, refetch } = useSalesListQuery(searchText || undefined);
  const { data: activeShift } = useActiveShiftQuery();

  // Filter transactions: CASHIER sees own only, MANAGER+ sees all
  const sales = React.useMemo(() => {
    if (!allSales) return undefined;
    if (can('viewAllTransactions')) return allSales;
    return allSales.filter((s: any) => s.createdByUserId === user?.id || s.completedByUserId === user?.id);
  }, [allSales, can, user?.id]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const styles = createStyles();

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setPendingSales(getPendingSales());
      setIsRefreshing(false);
    }
  }, [refetch]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setPendingSales(getPendingSales());
      void refetch();
    });
    return unsubscribe;
  }, [navigation, refetch]);

  React.useEffect(() => onPendingSalesChanged(setPendingSales), []);

  const toggleFilter = useCallback(() => {
    setFilterOpen(prev => {
      if (prev) {
        // Closing clears search.
        setSearchText('');
      } else {
        // Opening focuses input after render.
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      return !prev;
    });
  }, []);

  // Tablet: track selected sale for inline detail pane
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Refund modal owned here (root level) to avoid Android ANR from Modals inside SplitView.
  const [refundVisible, setRefundVisible] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [voidSaleTarget, setVoidSaleTarget] = useState<{ id: string; saleNo: string } | null>(null);

  // Fetch the sale detail for refund flow (when refundSaleId is set)
  const { data: refundSale } = useSaleDetailQuery(refundSaleId ?? '');

  const visibleSales = React.useMemo(() => sales ?? getCachedTransactions(), [sales]);
  const displaySales = React.useMemo(() => {
    let filtered = visibleSales;
    if (quickFilter === 'completed') {
      filtered = filtered.filter(s => s.status === 'COMPLETED');
    } else if (quickFilter === 'attention') {
      filtered = filtered.filter(s => s.status === 'PARTIALLY_REFUNDED' || s.status === 'REFUNDED' || s.status === 'VOIDED');
    } else if (quickFilter === 'account') {
      filtered = filtered.filter(s => s.hasAccountPayment);
    }

    if (!searchText) return filtered;
    const q = searchText.toLowerCase();
    return filtered.filter(s => (
      s.saleNo.toLowerCase().includes(q) ||
      (s.receiptNumber && s.receiptNumber.toLowerCase().includes(q)) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      (s.paymentMethods && s.paymentMethods.toLowerCase().includes(q))
    ));
  }, [quickFilter, searchText, visibleSales]);

  const transactionSummary = React.useMemo(() => {
    return displaySales.reduce(
      (acc, sale) => {
        acc.total += parseFloat(sale.grandTotal || '0');
        if (sale.status === 'COMPLETED') acc.completed += 1;
        if (sale.status === 'PARTIALLY_REFUNDED' || sale.status === 'REFUNDED' || sale.status === 'VOIDED') acc.attention += 1;
        if (sale.hasAccountPayment) acc.account += 1;
        return acc;
      },
      { total: 0, completed: 0, attention: 0, account: 0 },
    );
  }, [displaySales]);

  const quickFilters = React.useMemo(() => ([
    { key: 'all' as const, label: 'All', count: visibleSales.length },
    { key: 'completed' as const, label: 'Completed', count: visibleSales.filter(s => s.status === 'COMPLETED').length },
    { key: 'attention' as const, label: 'Adjustments', count: visibleSales.filter(s => s.status === 'PARTIALLY_REFUNDED' || s.status === 'REFUNDED' || s.status === 'VOIDED').length },
    { key: 'account' as const, label: 'Account', count: visibleSales.filter(s => s.hasAccountPayment).length },
  ]), [visibleSales]);

  // Keep tablet detail selection valid after refreshes and filters.
  React.useEffect(() => {
    if (!isTablet) return;
    if (displaySales.length === 0) {
      if (selectedSaleId) setSelectedSaleId(null);
      return;
    }
    if (!selectedSaleId || !displaySales.some(s => s.id === selectedSaleId)) {
      setSelectedSaleId(displaySales[0].id);
    }
  }, [isTablet, selectedSaleId, displaySales]);

  const handlePressSale = useCallback((item: SaleListItem) => {
    if (isTablet) {
      setSelectedSaleId(item.id);
    } else {
      navigation.navigate('TransactionDetail', { saleId: item.id });
    }
  }, [isTablet, navigation]);

  // Called by TransactionDetailPane when user taps Refund.
  const handleRefundPress = useCallback((saleId: string) => {
    setRefundSaleId(saleId);
    setRefundVisible(true);
  }, []);

  const verifyAuthorization = useCallback(verifyRefundAuthorizationCredential, []);

  const handleRefunded = useCallback(() => {
    const saleId = refundSaleId;
    setRefundVisible(false);
    setRefundSaleId(null);
    if (saleId) {
      void queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] });
    }
    void queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
    refetch();
  }, [queryClient, refetch, refundSaleId]);

  const handleSyncPending = useCallback(async () => {
    setSyncingPending(true);
    try {
      const summary = await reconcilePendingSales();
      await refetch();
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
          'Still Offline',
          `${summary.retryLater} sale${summary.retryLater === 1 ? '' : 's'} will retry when the server is reachable.`,
        );
      }
    } catch (err: any) {
      Alert.alert('Sync Failed', formatPosError(err, 'Pending sales could not be synced.'));
    } finally {
      setSyncingPending(false);
      setPendingSales(getPendingSales());
    }
  }, [refetch]);

  const handleRefundClose = useCallback(() => {
    setRefundVisible(false);
    setRefundSaleId(null);
  }, []);

  const handleVoided = useCallback(() => {
    if (voidSaleTarget?.id) {
      void queryClient.invalidateQueries({ queryKey: ['sales', 'detail', voidSaleTarget.id] });
    }
    void queryClient.invalidateQueries({ queryKey: ['sales', 'list'] });
    refetch();
  }, [queryClient, refetch, voidSaleTarget?.id]);

  const pendingSummary = React.useMemo(() => summarizePendingSales(pendingSales), [pendingSales]);
  const pendingRows = React.useMemo(() => getPendingSaleReviewRows(pendingSales, 3), [pendingSales]);
  const pendingRetryCount = pendingSummary.retryable;
  const pendingFailedCount = pendingSummary.failed;

  const renderItem = useCallback(({ item, index }: { item: SaleListItem; index: number }) => {
    const isSelected = isTablet && item.id === selectedSaleId;
    return (
      <Pressable
        style={[
          styles.row,
          { backgroundColor: index % 2 === 0 ? colors.bg.primary : colors.bg.surface },
          isSelected && styles.rowSelected,
        ]}
        android_ripple={{ color: colors.accent.glow }}
        onPress={() => handlePressSale(item)}
      >
        <View style={styles.rowLeft}>
          <Text style={styles.receiptNo}>{item.receiptNumber || item.saleNo}</Text>
          {item.receiptNumber ? (
            <Text style={styles.saleNoText}>{item.saleNo}</Text>
          ) : null}
          {item.customerName ? (
            <Text style={styles.customerLine} numberOfLines={1}>
              {item.customerName}{item.hasAccountPayment ? ' / Account sale' : ''}
            </Text>
          ) : item.hasAccountPayment ? (
            <Text style={styles.customerLine}>Account sale</Text>
          ) : null}
          <Text style={styles.rowTime}>{fmtTime(item.completedAt || item.createdAt)}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowTotal}>{fmtPHP(item.grandTotal)}</Text>
          <Badge label={formatStatus(item.status)} variant={getBadgeVariant(item.status)} />
        </View>
      </Pressable>
    );
  }, [isTablet, selectedSaleId, handlePressSale]);

  const listContent = (
    <View style={styles.listContainer}>
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        <View>
          <Text style={styles.headerTitle}>Transactions</Text>
          <Text style={styles.headerSubtitle}>{searchText ? 'Search results' : 'Today'}</Text>
        </View>
        <Pressable
          style={[styles.filterBtn, filterOpen && styles.filterBtnActive]}
          android_ripple={{ color: colors.accent.glow }}
          onPress={toggleFilter}
        >
          <Icon
            name={filterOpen ? 'close' : 'search'}
            size={20}
            color={filterOpen ? colors.text.inverse : colors.text.secondary}
          />
        </Pressable>
      </View>

      {filterOpen && (
        <View style={[styles.searchContainer, { paddingHorizontal: screenPadding }]}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Transaction # or receipt #"
            placeholderTextColor={colors.text.muted}
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <Pressable style={styles.clearBtn} onPress={() => setSearchText('')}>
              <Icon name="close" size={16} color={colors.text.secondary} />
            </Pressable>
          )}
        </View>
      )}

      <View style={[styles.summaryPanel, { marginHorizontal: screenPadding }]}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.summaryEyebrow}>Visible register activity</Text>
            <Text style={styles.summaryTotal}>{fmtPHP(transactionSummary.total)}</Text>
          </View>
          <View style={styles.summaryCountBox}>
            <Text style={styles.summaryCount}>{displaySales.length}</Text>
            <Text style={styles.summaryCountLabel}>sales</Text>
          </View>
        </View>
        <View style={styles.summaryMetrics}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryMetricValue}>{transactionSummary.completed}</Text>
            <Text style={styles.summaryMetricLabel}>completed</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryMetricValue}>{transactionSummary.attention}</Text>
            <Text style={styles.summaryMetricLabel}>adjusted</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryMetricValue}>{transactionSummary.account}</Text>
            <Text style={styles.summaryMetricLabel}>account</Text>
          </View>
        </View>
      </View>

      <View style={[styles.quickFilterStrip, { paddingHorizontal: screenPadding }]}>
        {quickFilters.map(filter => {
          const active = filter.key === quickFilter;
          return (
            <Pressable
              key={filter.key}
              style={[styles.quickFilterChip, active && styles.quickFilterChipActive]}
              android_ripple={{ color: colors.accent.glow }}
              onPress={() => setQuickFilter(filter.key)}
            >
              <Text style={[styles.quickFilterText, active && styles.quickFilterTextActive]}>
                {filter.label}
              </Text>
              <Text style={[styles.quickFilterCount, active && styles.quickFilterTextActive]}>
                {filter.count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {pendingSales.length > 0 && (
        <View style={styles.pendingBanner}>
          <View style={styles.pendingHeaderRow}>
            <View style={styles.pendingCopy}>
              <Text style={styles.pendingText}>
                {pendingRetryCount > 0
                  ? `${pendingRetryCount} sale${pendingRetryCount === 1 ? '' : 's'} awaiting sync`
                  : 'Pending sales need manager review'}
              </Text>
              <Text style={styles.pendingHint}>
                Oldest {pendingSummary.oldestAgeLabel} / {fmtPHP(pendingSummary.totalPayments)} queued
                {pendingFailedCount > 0 ? ` / ${pendingFailedCount} review` : ''}
              </Text>
            </View>
            {pendingRetryCount > 0 && (
              <Pressable
                style={[styles.pendingSyncBtn, syncingPending && styles.pendingSyncBtnDisabled]}
                onPress={handleSyncPending}
                disabled={syncingPending}
              >
                <Text style={styles.pendingSyncText}>{syncingPending ? 'Syncing...' : 'Sync'}</Text>
              </Pressable>
            )}
          </View>
          {pendingRows.length > 0 && (
            <View style={styles.pendingReviewList}>
              {pendingRows.map(row => (
                <View key={row.id} style={styles.pendingReviewRow}>
                  <View style={[
                    styles.pendingStatusDot,
                    row.tone === 'danger' ? styles.pendingStatusDanger : row.tone === 'info' ? styles.pendingStatusInfo : styles.pendingStatusWarning,
                  ]} />
                  <View style={styles.pendingReviewCopy}>
                    <Text style={styles.pendingReviewTitle} numberOfLines={1}>{row.title}</Text>
                    <Text style={styles.pendingReviewDetail} numberOfLines={1}>{row.detail}</Text>
                  </View>
                  <View style={styles.pendingReviewMeta}>
                    <Text style={styles.pendingReviewAmount}>{row.amountLabel}</Text>
                    <Text style={styles.pendingReviewAge}>{row.ageLabel}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Shift status bar */}
      {activeShift ? (
        <View style={styles.shiftBanner}>
          <View style={styles.shiftInfo}>
            <Text style={styles.shiftText}>
              Shift Open since {fmtTime(activeShift.openedAt)}
            </Text>
          </View>
          <View style={styles.shiftActions}>
            <Pressable
              style={styles.shiftBtnSecondary}
              android_ripple={{ color: colors.accent.glow }}
              onPress={() => navigation.navigate('ZReading' as any, { shiftId: activeShift.id, mode: 'view' })}
            >
              <Text style={styles.shiftBtnSecondaryText}>Summary</Text>
            </Pressable>
            <Pressable
              style={styles.shiftBtnPrimary}
              android_ripple={{ color: colors.accent.glow }}
              onPress={() => navigation.navigate('ZReading' as any, { shiftId: activeShift.id, mode: 'close' })}
            >
              <Text style={styles.shiftBtnPrimaryText}>Z-Reading</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.noShiftBanner}>
          <Text style={styles.noShiftText}>No active shift</Text>
          <Text style={styles.noShiftHint}>A shift will start automatically on your first sale</Text>
        </View>
      )}

      <FlatList
        data={displaySales}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        extraData={selectedSaleId}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.primary}
            progressBackgroundColor={colors.bg.surface}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{searchText ? 'No matching transactions' : 'No transactions today'}</Text>
          </View>
        }
      />
    </View>
  );

  // Phone: just the list (detail navigates to separate screen)
  if (!isTablet) {
    return (
      <SafeAreaView style={styles.container}>
        {listContent}
      </SafeAreaView>
    );
  }

  // Tablet split view; modals render outside SplitView to avoid Android ANR.
  return (
    <SafeAreaView style={styles.container}>
      <SplitView
        primaryRatio={0.38}
        primary={listContent}
        secondary={
          selectedSaleId ? (
            <TransactionDetailPane
              saleId={selectedSaleId}
              onRefunded={refetch}
              onRefundPress={handleRefundPress}
              onVoidPress={setVoidSaleTarget}
            />
          ) : (
            <View style={styles.emptyDetail}>
              <Text style={styles.emptyDetailText}>Select a transaction</Text>
            </View>
          )
        }
      />

      {/* RefundFlow at root level, outside SplitView to prevent Android ANR */}
      {refundSale && (
        <RefundFlow
          visible={refundVisible}
          onClose={handleRefundClose}
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
          verifyAuthorization={verifyAuthorization}
        />
      )}
      <VoidSaleSheet
        visible={!!voidSaleTarget}
        saleId={voidSaleTarget?.id ?? null}
        saleNo={voidSaleTarget?.saleNo ?? null}
        onClose={() => setVoidSaleTarget(null)}
        onVoided={handleVoided}
      />
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  listContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.headerPaddingTop,
    paddingBottom: layout.headerPaddingBottom,
    backgroundColor: colors.bg.primary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  headerSubtitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  filterBtn: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  filterBtnActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  filterBtnIcon: {
    fontSize: 20,
    color: colors.text.secondary,
  },
  filterBtnIconActive: {
    color: colors.text.inverse,
  },
  searchContainer: {
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    ...textStyles.body,
    flex: 1,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: fonts.mono.medium,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontFamily: fonts.display.bold,
  },
  summaryPanel: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  summaryEyebrow: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  summaryTotal: {
    ...textStyles.monoLg,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  summaryCountBox: {
    minWidth: 62,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
  },
  summaryCount: {
    ...textStyles.monoMd,
    color: colors.accent.primary,
  },
  summaryCountLabel: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
  },
  summaryMetrics: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  summaryMetric: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
  },
  summaryMetricValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  summaryMetricLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  quickFilterStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  quickFilterChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    overflow: 'hidden',
  },
  quickFilterChipActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  quickFilterText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  quickFilterCount: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    fontFamily: fonts.mono.medium,
  },
  quickFilterTextActive: {
    color: colors.text.inverse,
  },
  pendingBanner: {
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.sync.offlineBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pendingCopy: {
    flex: 1,
  },
  pendingText: {
    ...textStyles.caption,
    color: colors.sync.offlineText,
  },
  pendingHint: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  pendingSyncBtn: {
    minHeight: 36,
    minWidth: 72,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent.primary,
  },
  pendingSyncBtnDisabled: {
    opacity: 0.65,
  },
  pendingSyncText: {
    ...textStyles.button,
    color: colors.text.inverse,
  },
  pendingReviewList: {
    gap: 6,
  },
  pendingReviewRow: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pendingStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pendingStatusWarning: {
    backgroundColor: colors.status.warning,
  },
  pendingStatusDanger: {
    backgroundColor: colors.status.danger,
  },
  pendingStatusInfo: {
    backgroundColor: colors.status.info,
  },
  pendingReviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  pendingReviewTitle: {
    ...textStyles.caption,
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
  },
  pendingReviewDetail: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  pendingReviewMeta: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  pendingReviewAmount: {
    ...textStyles.monoSm,
    color: colors.text.primary,
  },
  pendingReviewAge: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  rowSelected: {
    backgroundColor: colors.bg.elevated,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.primary,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  receiptNo: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  saleNoText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  rowTime: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: spacing.xs,
  },
  customerLine: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  rowTotal: {
    ...textStyles.price,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.muted,
  },
  emptyDetail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
  },
  emptyDetailText: {
    ...textStyles.body,
    color: colors.text.muted,
  },
  // Shift banner styles
  shiftBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.shift.bannerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.shift.bannerBorder,
  },
  shiftInfo: {
    flex: 1,
  },
  shiftText: {
    ...textStyles.caption,
    color: colors.shift.bannerText,
    fontFamily: fonts.mono.medium,
  },
  shiftActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  shiftBtnSecondary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.shift.bannerText,
    overflow: 'hidden',
  },
  shiftBtnSecondaryText: {
    ...textStyles.captionSmall,
    color: colors.shift.bannerText,
    fontFamily: fonts.display.bold,
  },
  shiftBtnPrimary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.shift.bannerBtnBg,
    overflow: 'hidden',
  },
  shiftBtnPrimaryText: {
    ...textStyles.captionSmall,
    color: colors.shift.bannerBtnText,
    fontFamily: fonts.display.bold,
  },
  noShiftBanner: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg.elevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    borderRadius: 0,
  },
  noShiftText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  noShiftHint: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: spacing.xs,
  },
});
