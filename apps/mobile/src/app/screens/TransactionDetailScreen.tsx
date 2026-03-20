import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSaleDetailQuery } from '@/hooks/use-transactions';
import { usePrinter } from '@/hardware/printer/context';
import { useAuth } from '@/hooks/use-auth';
import { RefundFlow } from '@/components/RefundFlow';
import { apiFetch } from '@/services/api-client';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, layout, radius } from '@/theme';
import { Card, Badge, Divider, Button } from '@/components/ui';
import type { ReceiptData } from '@/hardware/printer/types';
import type { TransactionsStackParamList } from '@/app/MainTabs';

type Route = RouteProp<TransactionsStackParamList, 'TransactionDetail'>;

function fmtPHP(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'REFUNDED' || status === 'VOIDED') return 'danger';
  if (status === 'PARTIALLY_REFUNDED') return 'warning';
  return 'success';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bRefunded\b/, 'Refunded');
}

export default function TransactionDetailScreen() {
  const navigation = useNavigation();
  const { isTablet, screenPadding } = useLayout();
  const route = useRoute<Route>();
  const { saleId } = route.params;
  const { data: sale, isLoading, refetch } = useSaleDetailQuery(saleId);
  const printer = usePrinter();
  const { user } = useAuth();

  const [refundVisible, setRefundVisible] = useState(false);

  const styles = createStyles();

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

  const handleRefundPress = useCallback(() => {
    setRefundVisible(true);
  }, []);

  const handleRefunded = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleReprint = useCallback(async () => {
    if (!sale) return;
    const receiptData: ReceiptData = {
      header: {
        storeName: sale.location?.name || 'APEX AUTO PARTS',
        address: sale.location?.address || undefined,
      },
      transaction: {
        receiptNumber: sale.saleNo,
        date: sale.completedAt ? new Date(sale.completedAt).toLocaleString() : new Date(sale.createdAt).toLocaleString(),
        cashier: user?.fullName || 'Cashier',
        lines: sale.lines.map(l => ({
          name: l.productName,
          qty: l.quantity,
          unitPrice: parseFloat(l.unitPrice),
          total: parseFloat(l.lineTotal),
        })),
        subtotal: parseFloat(sale.subtotal),
        discount: parseFloat(sale.discountTotal),
        grandTotal: parseFloat(sale.grandTotal),
        paymentMethod: sale.payments[0]?.method === 'ACCOUNT' ? 'CHARGE' : (sale.payments[0]?.method || 'CASH'),
        payments: sale.payments.map(p => ({
          method: p.method === 'ACCOUNT' ? 'CHARGE' : p.method,
          amount: parseFloat(p.amount),
          reference: p.reference || undefined,
          installmentTerm: p.notes?.includes('Installment:') ? p.notes.replace('Installment: ', '').replace(' ', '_').toUpperCase() : undefined,
        })),
      },
      footer: { message: '** REPRINT **' },
    };

    const result = await printer.printReceipt(receiptData);
    if (!result.success) {
      Alert.alert('Print Failed', result.error || 'Could not print receipt');
    }
  }, [sale, printer, user]);

  if (isLoading || !sale) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          android_ripple={{ color: colors.accent.glow, borderless: true }}
          hitSlop={12}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{sale.saleNo}</Text>
        <Button
          title="Reprint"
          variant="secondary"
          onPress={handleReprint}
          style={styles.reprintButton}
          textStyle={styles.reprintButtonText}
        />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={[
        styles.bodyContent,
        { padding: screenPadding },
        isTablet && styles.tabletBody,
      ]}>
        {/* Status + time */}
        <View style={styles.statusRow}>
          <Badge label={formatStatus(sale.status)} variant={getBadgeVariant(sale.status)} />
          <Text style={styles.dateText}>
            {sale.completedAt ? new Date(sale.completedAt).toLocaleString() : new Date(sale.createdAt).toLocaleString()}
          </Text>
        </View>

        {/* Customer */}
        {sale.customer && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Customer</Text>
            <Text style={styles.customerName}>{sale.customer.name}</Text>
            {sale.customer.phone && (
              <Text style={styles.customerDetail}>{sale.customer.phone}</Text>
            )}
            {sale.vehicle && (
              <Text style={styles.customerDetail}>
                {sale.vehicle.make} {sale.vehicle.model} {sale.vehicle.plateNo ? `· ${sale.vehicle.plateNo}` : ''}
              </Text>
            )}
          </Card>
        )}

        {/* Line items */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Items</Text>
          {sale.lines.map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Divider style={styles.itemDivider} />}
              <View style={styles.lineRow}>
                <View style={styles.lineInfo}>
                  <Text style={styles.lineName}>{line.productName}</Text>
                  <Text style={styles.lineMeta}>
                    {line.quantity} x {fmtPHP(line.unitPrice)}
                  </Text>
                </View>
                <Text style={styles.lineTotal}>{fmtPHP(line.lineTotal)}</Text>
              </View>
            </React.Fragment>
          ))}
        </Card>

        {/* Totals */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Totals</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtPHP(sale.subtotal)}</Text>
          </View>
          {parseFloat(sale.discountTotal) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalValue, { color: colors.status.danger }]}>
                -{fmtPHP(sale.discountTotal)}
              </Text>
            </View>
          )}
          <Divider style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{fmtPHP(sale.grandTotal)}</Text>
          </View>
        </Card>

        {/* Payments */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Payment</Text>
          {sale.payments.map((p, i) => (
            <View key={i} style={styles.paymentBlock}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentMethod}>
                  {p.method === 'ACCOUNT' ? 'CHARGE' : p.method}
                </Text>
                <Text style={styles.paymentAmount}>{fmtPHP(p.amount)}</Text>
              </View>
              {p.reference ? (
                <Text style={styles.paymentRef}>Ref: {p.reference}</Text>
              ) : null}
              {p.notes ? (
                <Text style={styles.paymentRef}>{p.notes}</Text>
              ) : null}
            </View>
          ))}
        </Card>

        {/* Refund button — for completed or partially refunded sales */}
        {(sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REFUNDED') && (
          <Button
            title={sale.status === 'PARTIALLY_REFUNDED' ? 'Refund Remaining Items' : 'Refund'}
            variant="danger"
            fullWidth
            onPress={handleRefundPress}
            style={styles.refundButton}
          />
        )}
      </ScrollView>

      {sale && (
        <RefundFlow
          visible={refundVisible}
          onClose={() => setRefundVisible(false)}
          saleId={sale.id}
          saleNo={sale.saleNo}
          lines={sale.lines.map(l => ({
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

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    backgroundColor: colors.bg.primary,
  },
  backText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  headerTitle: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  reprintButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  reprintButtonText: {
    ...textStyles.caption,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: spacing.sm,
  },
  tabletBody: {
    maxWidth: 700,
    alignSelf: 'center',
    width: '100%',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  dateText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  sectionCard: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  customerName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  customerDetail: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  lineInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  lineName: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  lineMeta: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  lineTotal: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  itemDivider: {
    marginVertical: 0,
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
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  totalDivider: {
    marginVertical: spacing.sm,
  },
  grandLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  grandValue: {
    ...textStyles.monoLg,
    color: colors.accent.primary,
  },
  paymentBlock: {
    marginBottom: spacing.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentMethod: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  paymentAmount: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  paymentRef: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  refundButton: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
