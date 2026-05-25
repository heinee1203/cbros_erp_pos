import React, { useCallback, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ReceiptDataPreviewModal } from '@/components/ReceiptDataPreviewModal';
import { Button, Icon } from '@/components/ui';
import { usePrinter } from '@/hardware/printer/context';
import { printReceiptSafely } from '@/hardware/printer/settings';
import { getLastTransactionReprint } from '@/storage/last-transaction-reprint';
import { colors, fontSize, fonts, radius, spacing, textStyles } from '@/theme';

function fmtStoredAt(value: string): string {
  return new Date(value).toLocaleString('en-PH');
}

export default function LastTransactionReprintScreen() {
  const printer = usePrinter();
  const [record] = useState(() => getLastTransactionReprint());
  const [previewVisible, setPreviewVisible] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handlePrint = useCallback(async () => {
    if (!record || printing) return;
    setPrinting(true);
    try {
      await printReceiptSafely(printer, record.receipt, {
        type: 'receipt',
        title: `Receipt ${record.receiptNumber}`,
        sourceId: record.saleId,
      });
    } finally {
      setPrinting(false);
    }
  }, [printer, printing, record]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Icon name="receipt" size={26} color={colors.accent.primary} />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Last Transaction Reprint</Text>
            <Text style={styles.subtitle}>Fast reprint for the last completed sale on this tablet.</Text>
          </View>
        </View>

        {!record ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No receipt stored yet</Text>
            <Text style={styles.emptyText}>Complete a sale first, then return here for quick preview and reprint.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Info label="Receipt" value={record.receiptNumber} />
            <Info label="Sale" value={record.saleNo || record.saleId || 'Local sale'} />
            <Info label="Stored" value={fmtStoredAt(record.storedAt)} />
            <View style={styles.actions}>
              <Button title="Preview Receipt" onPress={() => setPreviewVisible(true)} variant="secondary" fullWidth />
              <Button title={printing ? 'Printing...' : 'Print Last Receipt'} onPress={handlePrint} loading={printing} fullWidth />
            </View>
          </View>
        )}
      </View>
      {record ? (
        <ReceiptDataPreviewModal
          visible={previewVisible}
          receipt={record.receipt}
          onClose={() => setPreviewVisible(false)}
          onPrint={handlePrint}
          printing={printing}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginTop: 2,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  infoRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  infoLabel: {
    ...textStyles.caption,
    color: colors.text.muted,
  },
  infoValue: {
    fontFamily: fonts.body.semiBold,
    color: colors.text.primary,
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: {
    gap: spacing.sm,
  },
});
