import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSalesListQuery, getCachedTransactions, type SaleListItem } from '@/hooks/use-transactions';
import { getPendingSales } from '@/storage/pending-sales';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, layout } from '@/theme';
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

function getBadgeVariant(status: string): 'success' | 'danger' {
  if (status === 'REFUNDED' || status === 'VOIDED') return 'danger';
  return 'success';
}

export default function TransactionListScreen() {
  const navigation = useNavigation<Nav>();
  const { screenPadding } = useLayout();
  const { data: sales, isLoading, refetch } = useSalesListQuery();
  const pendingSales = getPendingSales();

  const displaySales = sales ?? getCachedTransactions();

  const renderItem = useCallback(({ item, index }: { item: SaleListItem; index: number }) => (
    <Pressable
      style={[
        styles.row,
        { backgroundColor: index % 2 === 0 ? colors.bg.primary : colors.bg.surface },
      ]}
      android_ripple={{ color: colors.accent.glow }}
      onPress={() => navigation.navigate('TransactionDetail', { saleId: item.id })}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.receiptNo}>{item.saleNo}</Text>
        <Text style={styles.rowTime}>{fmtTime(item.completedAt || item.createdAt)}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowTotal}>{fmtPHP(item.grandTotal)}</Text>
        <Badge label={item.status} variant={getBadgeVariant(item.status)} />
      </View>
    </Pressable>
  ), [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
        <Text style={styles.headerTitle}>Transactions</Text>
        <Text style={styles.headerSubtitle}>Today</Text>
      </View>

      {/* Pending sales banner */}
      {pendingSales.length > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            {pendingSales.length} pending sale{pendingSales.length > 1 ? 's' : ''} awaiting sync
          </Text>
        </View>
      )}

      <FlatList
        data={displaySales}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.accent.primary}
            progressBackgroundColor={colors.bg.surface}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions today</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.headerPaddingTop,
    paddingBottom: layout.headerPaddingBottom,
    backgroundColor: colors.bg.primary,
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
});
