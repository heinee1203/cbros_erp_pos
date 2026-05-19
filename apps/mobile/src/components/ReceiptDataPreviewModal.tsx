import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReceiptData } from '@/hardware/printer/types';
import { colors, radius, spacing, textStyles } from '@/theme';
import { Button } from '@/components/ui';

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ReceiptDataPreviewModalProps {
  visible: boolean;
  receipt: ReceiptData;
  onClose: () => void;
  onPrint?: () => void;
  printing?: boolean;
  printDisabled?: boolean;
  printLabel?: string;
  statusLabel?: string;
}

export function ReceiptDataPreviewModal({
  visible,
  receipt,
  onClose,
  onPrint,
  printing = false,
  printDisabled = false,
  printLabel = 'Print Receipt',
  statusLabel,
}: ReceiptDataPreviewModalProps) {
  const payments = receipt.transaction.payments ?? [];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.headerBar}>
            <View>
              <Text style={styles.title}>Receipt Preview</Text>
              <Text style={styles.subtitle}>{receipt.transaction.receiptNumber}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeIcon}>
              <Text style={styles.closeIconText}>X</Text>
            </Pressable>
          </View>

          {statusLabel ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={styles.storeName}>{receipt.header.storeName}</Text>
            {receipt.header.address ? <Text style={styles.centerLine}>{receipt.header.address}</Text> : null}
            {receipt.header.phone ? <Text style={styles.centerLine}>{receipt.header.phone}</Text> : null}

            <Text style={styles.divider}>{'='.repeat(32)}</Text>
            <Text style={styles.line}>Receipt #: {receipt.transaction.receiptNumber}</Text>
            <Text style={styles.line}>Date: {receipt.transaction.date}</Text>
            <Text style={styles.line}>Cashier: {receipt.transaction.cashier}</Text>
            <Text style={styles.divider}>{'-'.repeat(32)}</Text>

            {receipt.transaction.lines.map((line, index) => (
              <View key={`${line.name}-${index}`} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={2}>{line.name}</Text>
                <Text style={styles.itemDetail}>
                  {'  '}{line.qty} x {fmtPHP(line.unitPrice)}    {fmtPHP(line.total)}
                </Text>
              </View>
            ))}

            <Text style={styles.divider}>{'-'.repeat(32)}</Text>
            {receipt.transaction.discount > 0 ? (
              <>
                <Text style={styles.totalLine}>Subtotal:         {fmtPHP(receipt.transaction.subtotal)}</Text>
                <Text style={styles.totalLine}>Discount:        -{fmtPHP(receipt.transaction.discount)}</Text>
              </>
            ) : null}
            <Text style={styles.grandTotal}>TOTAL:            {fmtPHP(receipt.transaction.grandTotal)}</Text>
            <Text style={styles.divider}>{'-'.repeat(32)}</Text>

            {payments.length > 0 ? (
              payments.map((payment, index) => (
                <View key={`${payment.method}-${index}`} style={styles.paymentBlock}>
                  <Text style={styles.line}>{payment.method}: {fmtPHP(payment.amount)}</Text>
                  {payment.reference ? (
                    <Text style={styles.metaLine}>Ref: {payment.reference}</Text>
                  ) : null}
                  {payment.installmentTerm ? (
                    <Text style={styles.metaLine}>Term: {payment.installmentTerm.replace(/_/g, ' ')}</Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.line}>{receipt.transaction.paymentMethod}: {fmtPHP(receipt.transaction.grandTotal)}</Text>
            )}

            {receipt.transaction.cashTendered != null ? (
              <>
                <Text style={styles.line}>Cash Tendered: {fmtPHP(receipt.transaction.cashTendered)}</Text>
                <Text style={styles.line}>Change: {fmtPHP(receipt.transaction.change ?? 0)}</Text>
              </>
            ) : null}

            <Text style={styles.divider}>{'='.repeat(32)}</Text>
            <Text style={styles.footer}>{receipt.footer.message}</Text>
          </ScrollView>

          <View style={styles.footerBar}>
            {onPrint ? (
              <Button
                title={printing ? 'Printing...' : printLabel}
                onPress={onPrint}
                variant="secondary"
                loading={printing}
                disabled={printing || printDisabled}
                style={styles.printButton}
              />
            ) : null}
            <Button title="Close" onPress={onClose} variant="primary" style={styles.closeButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(23,32,51,0.44)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '86%',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: 'hidden',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
  },
  closeIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.bg.elevated,
  },
  closeIconText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  statusPill: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.status.warningBg,
    borderWidth: 1,
    borderColor: colors.status.warning,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.status.warningText,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingVertical: spacing.lg,
  },
  storeName: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text.primary,
  },
  centerLine: {
    fontFamily: 'monospace',
    fontSize: 10,
    textAlign: 'center',
    color: colors.text.secondary,
    marginTop: 2,
  },
  divider: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.text.muted,
    textAlign: 'center',
    marginVertical: 6,
  },
  line: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.text.secondary,
    marginVertical: 1,
  },
  itemRow: {
    marginVertical: 3,
  },
  itemName: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.text.primary,
    fontWeight: '600',
  },
  itemDetail: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 1,
  },
  totalLine: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.text.secondary,
    marginVertical: 1,
  },
  grandTotal: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginVertical: 4,
  },
  paymentBlock: {
    marginBottom: spacing.xs,
  },
  metaLine: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.text.muted,
    marginLeft: spacing.md,
  },
  footer: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text.secondary,
    marginTop: 4,
  },
  footerBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
  },
  printButton: {
    flex: 1,
  },
  closeButton: {
    flex: 1,
  },
});
