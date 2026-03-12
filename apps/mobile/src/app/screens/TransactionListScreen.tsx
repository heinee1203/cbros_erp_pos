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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSalesListQuery, useSaleDetailQuery, getCachedTransactions, type SaleListItem } from '@/hooks/use-transactions';
import { useActiveShiftQuery } from '@/hooks/use-shift';
import { getPendingSales } from '@/storage/pending-sales';
import { useLayout } from '@/hooks/use-layout';
import { SplitView } from '@/components/SplitView';
import { TransactionDetailPane } from '@/components/TransactionDetailPane';
import { RefundFlow } from '@/components/RefundFlow';
import { apiFetch } from '@/services/api-client';
import { colors, textStyles, spacing, layout, fonts } from '@/theme';
import { Badge } from '@/components/ui';
import type { TransactionsStackParamList } from '@/app/MainTabs';

type Nav = StackNavigationProp<TransactionsStackParamList, 'TransactionList'>;

function fmtPHP(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function getBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'REFUNDED' || status === 'VOIDED') return 'danger';
  if (status === 'PARTIALLY_REFUNDED') return 'warning';
  return 'success';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bRefunded\b/, 'Refunded');
}

export default function TransactionListScreen() {
  const navigation = useNavigation<Nav>();
  const { isTablet, screenPadding } = useLayout();
  const [searchText, setSearchText] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const { data: sales, isLoading, refetch } = useSalesListQuery(searchText || undefined);
  const { data: activeShift } = useActiveShiftQuery();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);
  const pendingSales = getPendingSales();

  const toggleFilter = useCallback(() => {
    setFilterOpen(prev => {
      if (prev) {
        // Closing — clear search
        setSearchText('');
      } else {
        // Opening — focus input after render
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      return !prev;
    });
  }, []);

  // Tablet: track selected sale for inline detail pane
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Refund modal — owned here (root level) to avoid Android ANR from Modals inside SplitView
  const [refundVisible, setRefundVisible] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);

  // Fetch the sale detail for refund flow (when refundSaleId is set)
  const { data: refundSale } = useSaleDetailQuery(refundSaleId ?? '');

  const allSales = sales ?? getCachedTransactions();
  const displaySales = searchText
    ? allSales.filter(s => {
        const q = searchText.toLowerCase();
        return (
          s.saleNo.toLowerCase().includes(q) ||
          (s.receiptNumber && s.receiptNumber.toLowerCase().includes(q))
        );
      })
    : allSales;

  // Auto-select first sale on tablet when data loads and nothing selected
  React.useEffect(() => {
    if (isTablet && !selectedSaleId && displaySales && displaySales.length > 0) {
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

  // Called by TransactionDetailPane when user taps Refund — opens RefundFlow directly (PIN is inside the flow)
  const handleRefundPress = useCallback((saleId: string) => {
    setRefundSaleId(saleId);
    setRefundVisible(true);
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const res = await apiFetch<{ valid: boolean }>('/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      return res.valid;
    } catch {
      return false;
    }
  }, []);

  const handleRefunded = useCallback(() => {
    setRefundVisible(false);
    setRefundSaleId(null);
    refetch();
  }, [refetch]);

  const handleRefundClose = useCallback(() => {
    setRefundVisible(false);
    setRefundSaleId(null);
  }, []);

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
          <Text style={styles.receiptNo}>{item.saleNo}</Text>
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
          <Text style={[styles.filterBtnIcon, filterOpen && styles.filterBtnIconActive]}>🔍</Text>
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
              <Text style={styles.clearBtnText}>✕</Text>
            </Pressable>
          )}
        </View>
      )}

      {pendingSales.length > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            {pendingSales.length} pending sale{pendingSales.length > 1 ? 's' : ''} awaiting sync
          </Text>
        </View>
      )}

      {/* Shift status bar */}
      {activeShift ? (
        <View style={styles.shiftBanner}>
          <View style={styles.shiftInfo}>
            <Text style={styles.shiftText}>
              Shift Open since {new Date(activeShift.openedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
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
              android_ripple={{ color: '#fff3' }}
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

  // Tablet: split view — list left, detail right
  // Modals rendered OUTSIDE SplitView to avoid Android ANR
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
            />
          ) : (
            <View style={styles.emptyDetail}>
              <Text style={styles.emptyDetailText}>Select a transaction</Text>
            </View>
          )
        }
      />

      {/* RefundFlow at root level — outside SplitView to prevent Android ANR */}
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
          verifyPin={verifyPin}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    width: 52,
    height: 52,
    borderRadius: 26,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.mono.medium,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontFamily: fonts.display.bold,
  },
  pendingBanner: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.sync.offlineBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  pendingText: {
    ...textStyles.caption,
    color: colors.sync.offlineText,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  rowSelected: {
    backgroundColor: colors.bg.elevated,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.primary,
  },
  rowLeft: {},
  rowRight: {
    alignItems: 'flex-end',
  },
  receiptNo: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  rowTime: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: spacing.xs,
  },
  rowTotal: {
    ...textStyles.monoMd,
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
    borderRadius: 6,
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
    borderRadius: 6,
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
