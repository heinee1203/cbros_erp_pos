import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSaleDetailQuery } from '@/hooks/use-transactions';
import { usePrinter } from '@/hardware/printer/context';
import { printReceiptSafely } from '@/hardware/printer/settings';
import { useAuth } from '@/hooks/use-auth';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { ReceiptPreviewModal } from '@/components/ReceiptPreviewModal';
import { buildSaleReceiptData, formatPaymentMethod } from '@/utils/receipt-data';
import { formatApiDateTime } from '@/utils/datetime';
import { colors, textStyles, spacing, layout, radius } from '@/theme';
import { Card, Badge, Divider, Button } from '@/components/ui';

function fmtPHP(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `\u20B1${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getEffectiveUnitPrice(line: { unitPrice: string; overridePrice?: string | null }): string {
  return line.overridePrice || line.unitPrice;
}

function getLineAdjustmentLabel(line: { unitPrice: string; overridePrice?: string | null; discountAmount?: string | null }): string {
  const parts: string[] = [];
  if (line.overridePrice) {
    parts.push(`Override from ${fmtPHP(line.unitPrice)}`);
  }
  const discountAmount = parseFloat(line.discountAmount || '0');
  if (discountAmount > 0) {
    parts.push(`Discount -${fmtPHP(discountAmount)}`);
  }
  return parts.join(' / ');
}

function getBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'REFUNDED' || status === 'VOIDED') return 'danger';
  if (status === 'PARTIALLY_REFUNDED' || status === 'QUOTE' || status === 'OPEN' || status === 'PARKED') return 'warning';
  return 'success';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bRefunded\b/, 'Refunded');
}

function canVoidStatus(status: string): boolean {
  return status === 'QUOTE' || status === 'OPEN' || status === 'PARKED';
}

function fmtDateTime(dateStr: string | null): string {
  return formatApiDateTime(dateStr, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseAmount(amount: string | number | null | undefined): number {
  if (typeof amount === 'number') return amount;
  const parsed = parseFloat(amount || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumPayments(payments: Array<{ amount: string }>): number {
  return payments.reduce((total, payment) => total + parseAmount(payment.amount), 0);
}

function sumLineUnits(lines: Array<{ quantity: number }>): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

function getPaymentHealth(paidTotal: number, grandTotal: number, paymentCount: number): {
  label: string;
  detail: string;
  tone: 'success' | 'warning' | 'danger';
} {
  if (paymentCount === 0) {
    return { label: 'No payment', detail: 'Review before closing', tone: 'warning' };
  }
  if (paidTotal + 0.005 < grandTotal) {
    return { label: 'Short paid', detail: `${fmtPHP(grandTotal - paidTotal)} remaining`, tone: 'danger' };
  }
  if (paidTotal - grandTotal > 0.005) {
    return { label: 'Over paid', detail: `${fmtPHP(paidTotal - grandTotal)} change/overage`, tone: 'warning' };
  }
  return { label: 'Paid', detail: `${paymentCount} tender${paymentCount === 1 ? '' : 's'}`, tone: 'success' };
}

interface TransactionDetailPaneProps {
  saleId: string;
  onRefunded?: () => void;
  /** Called when user taps Refund. Parent renders the authorization/refund modal. */
  onRefundPress?: (saleId: string) => void;
  /** Called when user taps Void. Parent renders the void modal outside SplitView. */
  onVoidPress?: (sale: { id: string; saleNo: string }) => void;
}

/**
 * Inline transaction detail panel used as the right pane in tablet SplitView.
 * No modals rendered here (they cause ANR inside SplitView on Android).
 * Modals are owned by the parent TransactionListScreen.
 */
export function TransactionDetailPane({ saleId, onRefunded, onRefundPress, onVoidPress }: TransactionDetailPaneProps) {
  const styles = createStyles();
  const { data: sale, isLoading, isError, error, refetch } = useSaleDetailQuery(saleId);
  const printer = usePrinter();
  const { user } = useAuth();
  const { can } = usePosPermission();
  const [reprinting, setReprinting] = useState(false);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  const handleRefundPress = useCallback(() => {
    onRefundPress?.(saleId);
  }, [onRefundPress, saleId]);

  const handleVoidPress = useCallback(() => {
    if (!sale) return;
    onVoidPress?.({ id: sale.id, saleNo: sale.saleNo });
  }, [onVoidPress, sale]);

  const handleReprint = useCallback(async () => {
    if (!sale || reprinting) return;
    const ownsSale = sale.createdByUserId === user?.id || sale.completedByUserId === user?.id;
    if (!can('reprintAnyReceipt') && !(ownsSale && can('reprintOwnReceipt'))) {
      Alert.alert('Permission Required', 'You do not have permission to reprint this receipt.');
      return;
    }

    if (!printer.isConnected) {
      Alert.alert(
        'No Printer Connected',
        'Connect a Bluetooth printer in Settings, or view the receipt on screen.',
        [
          { text: 'View on Screen', onPress: () => setReceiptModalVisible(true) },
          { text: 'OK', style: 'cancel' },
        ],
      );
      return;
    }

    const receiptData = buildSaleReceiptData(sale, user?.fullName || 'Cashier');

    setReprinting(true);
    try {
      const result = await printReceiptSafely(printer, receiptData);
      if (!result.success) {
        Alert.alert(
          'Print Failed',
          result.error || 'Could not print receipt.',
          [
            { text: 'View on Screen', onPress: () => setReceiptModalVisible(true) },
            { text: 'OK', style: 'cancel' },
          ],
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Print Error',
        err.message || 'Could not print receipt.',
        [
          { text: 'View on Screen', onPress: () => setReceiptModalVisible(true) },
          { text: 'OK', style: 'cancel' },
        ],
      );
    } finally {
      setReprinting(false);
    }
  }, [sale, reprinting, printer, user, can]);

  if (isError && !sale) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorTitle}>Transaction did not load</Text>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Check the server connection and try again.'}
        </Text>
        <Button
          title="Retry"
          variant="secondary"
          onPress={() => { void refetch(); }}
          style={styles.retryButton}
        />
      </View>
    );
  }

  if (isLoading || !sale) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading transaction...</Text>
      </View>
    );
  }

  const paidTotal = sumPayments(sale.payments);
  const grandTotal = parseAmount(sale.grandTotal);
  const unitCount = sumLineUnits(sale.lines);
  const paymentHealth = getPaymentHealth(paidTotal, grandTotal, sale.payments.length);
  const canRefundSale = can('processSale') && (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REFUNDED');
  const canVoidSale = can('processSale') && canVoidStatus(sale.status);

  return (
    <View style={styles.container}>
      {/* Inline header: sale number + reprint */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.saleNo}>{sale.receiptNumber || sale.saleNo}</Text>
            {sale.receiptNumber ? (
              <Text style={styles.saleNoSub}>{sale.saleNo}</Text>
            ) : null}
          </View>
          <Badge label={formatStatus(sale.status)} variant={getBadgeVariant(sale.status)} />
        </View>
        <View style={styles.headerActions}>
          <Button
            title="Receipt"
            variant="secondary"
            onPress={() => setReceiptModalVisible(true)}
            style={styles.headerButton}
            textStyle={styles.headerButtonText}
          />
          <Button
            title={reprinting ? 'Printing...' : 'Reprint'}
            variant="secondary"
            onPress={handleReprint}
            disabled={reprinting}
            style={styles.headerButton}
            textStyle={styles.headerButtonText}
          />
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Date */}
        <Text style={styles.dateText}>
          {fmtDateTime(sale.completedAt ?? sale.createdAt)}
        </Text>

        <Card style={styles.auditCard}>
          <View style={styles.auditHeader}>
            <Text style={styles.sectionLabel}>Sale audit</Text>
            <Text style={styles.auditReceipt}>{sale.receiptNumber || 'No receipt # yet'}</Text>
          </View>
          <View style={styles.auditGrid}>
            <View style={styles.auditTile}>
              <Text style={styles.auditLabel}>Payment</Text>
              <Text
                style={[
                  styles.auditValue,
                  paymentHealth.tone === 'success' && styles.auditValueSuccess,
                  paymentHealth.tone === 'warning' && styles.auditValueWarning,
                  paymentHealth.tone === 'danger' && styles.auditValueDanger,
                ]}
                numberOfLines={1}
              >
                {paymentHealth.label}
              </Text>
              <Text style={styles.auditDetail} numberOfLines={1}>{paymentHealth.detail}</Text>
            </View>
            <View style={styles.auditTile}>
              <Text style={styles.auditLabel}>Items</Text>
              <Text style={styles.auditValue}>{unitCount}</Text>
              <Text style={styles.auditDetail} numberOfLines={1}>
                {sale.lines.length} line{sale.lines.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.auditTile}>
              <Text style={styles.auditLabel}>Paid</Text>
              <Text style={styles.auditValue} numberOfLines={1}>{fmtPHP(paidTotal)}</Text>
              <Text style={styles.auditDetail} numberOfLines={1}>Total {fmtPHP(grandTotal)}</Text>
            </View>
            <View style={styles.auditTile}>
              <Text style={styles.auditLabel}>Action</Text>
              <Text style={styles.auditValue} numberOfLines={1}>
                {canRefundSale ? 'Refundable' : canVoidSale ? 'Voidable' : 'Locked'}
              </Text>
              <Text style={styles.auditDetail} numberOfLines={1}>
                {canRefundSale || canVoidSale ? 'Manager control ready' : 'No sale action available'}
              </Text>
            </View>
          </View>
        </Card>

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
                {sale.vehicle.make} {sale.vehicle.model}{sale.vehicle.plateNo ? ` - ${sale.vehicle.plateNo}` : ''}
              </Text>
            )}
          </Card>
        )}

        {/* Line items */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Items</Text>
          {sale.lines.map((line, i) => {
            const adjustment = getLineAdjustmentLabel(line);
            const refundedQuantity = line.refundedQuantity ?? 0;
            const refundableQuantity = Math.max(0, line.quantity - refundedQuantity);
            return (
              <React.Fragment key={i}>
                {i > 0 && <Divider style={styles.itemDivider} />}
                <View style={styles.lineRow}>
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName}>{line.productName}</Text>
                    <Text style={styles.lineMeta}>
                      {line.quantity} x {fmtPHP(getEffectiveUnitPrice(line))}
                    </Text>
                    {adjustment ? (
                      <Text style={styles.lineAdjustment}>{adjustment}</Text>
                    ) : null}
                    {refundedQuantity > 0 ? (
                      <Text style={styles.lineRefundMeta}>
                        Refunded {refundedQuantity}; {refundableQuantity} remaining
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.lineTotal}>{fmtPHP(line.lineTotal)}</Text>
                </View>
              </React.Fragment>
            );
          })}
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
          <View style={styles.paymentSummary}>
            <Text style={styles.paymentSummaryLabel}>Captured</Text>
            <Text
              style={[
                styles.paymentSummaryValue,
                paymentHealth.tone === 'danger' && styles.auditValueDanger,
                paymentHealth.tone === 'warning' && styles.auditValueWarning,
              ]}
            >
              {fmtPHP(paidTotal)}
            </Text>
          </View>
          {sale.payments.length === 0 && (
            <Text style={styles.emptyPaymentText}>No payment recorded</Text>
          )}
          {sale.payments.map((p, i) => (
            <View key={i} style={styles.paymentBlock}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentMethod}>
                  {formatPaymentMethod(p.method)}
                </Text>
                <Text style={styles.paymentAmount}>{fmtPHP(p.amount)}</Text>
              </View>
              {p.reference ? (
                <Text style={styles.paymentRef}>Ref: {p.reference}</Text>
              ) : null}
              {p.method === 'ACCOUNT' && sale.customer ? (
                <Text style={styles.paymentRef}>Account: {sale.customer.name}</Text>
              ) : null}
              {p.notes ? (
                <Text style={styles.paymentRef}>{p.notes}</Text>
              ) : null}
            </View>
          ))}
        </Card>

        {canRefundSale && (
          <Button
            title={sale.status === 'PARTIALLY_REFUNDED' ? 'Refund Remaining Items' : 'Refund'}
            variant="danger"
            fullWidth
            onPress={handleRefundPress}
            style={styles.refundButton}
          />
        )}
        {canVoidSale && (
          <Button
            title="Void Sale"
            variant="danger"
            fullWidth
            onPress={handleVoidPress}
            style={styles.refundButton}
          />
        )}
      </ScrollView>

      {sale && (
        <ReceiptPreviewModal
          visible={receiptModalVisible}
          sale={sale}
          cashierName={user?.fullName || 'Cashier'}
          onClose={() => setReceiptModalVisible(false)}
          onPrint={handleReprint}
          printing={reprinting}
          printLabel="Reprint"
        />
      )}
    </View>
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
    padding: spacing.lg,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  errorTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
    textAlign: 'center',
  },
  errorText: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  retryButton: {
    minWidth: 180,
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  saleNo: {
    ...textStyles.subheading,
    color: colors.text.primary,
  },
  saleNoSub: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButton: {
    minHeight: 36,
    minWidth: 82,
    paddingHorizontal: spacing.sm,
  },
  headerButtonText: {
    ...textStyles.caption,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: layout.screenPadding,
    gap: spacing.sm,
  },
  dateText: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginBottom: spacing.xs,
  },
  auditCard: {
    marginBottom: spacing.sm,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  auditReceipt: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
  },
  auditGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  auditTile: {
    width: '48%',
    minHeight: 72,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
  },
  auditLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  auditValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  auditValueSuccess: {
    color: colors.status.successText,
  },
  auditValueWarning: {
    color: colors.status.warningText,
  },
  auditValueDanger: {
    color: colors.status.dangerText,
  },
  auditDetail: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  sectionCard: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
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
  lineAdjustment: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  lineRefundMeta: {
    ...textStyles.captionSmall,
    color: colors.status.warningText,
    marginTop: 2,
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
  emptyPaymentText: {
    ...textStyles.body,
    color: colors.text.muted,
  },
  paymentSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  paymentSummaryLabel: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  paymentSummaryValue: {
    ...textStyles.monoMd,
    color: colors.text.primary,
  },
  refundButton: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
