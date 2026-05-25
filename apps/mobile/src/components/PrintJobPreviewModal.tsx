import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PrintJob } from '@/storage/print-jobs';
import { getPrinterLanguageLabel } from '@/hardware/printer/settings';
import { recordPrintPreviewMetadata } from '@/storage/print-preview-metadata';
import { colors, radius, spacing, textStyles } from '@/theme';
import { Button } from '@/components/ui';

interface PrintJobPreviewModalProps {
  visible: boolean;
  job: PrintJob | null;
  printerType: string;
  onClose: () => void;
  onPrint?: (job: PrintJob) => void;
  printing?: boolean;
}

function payloadSummary(job: PrintJob): string {
  if (job.payload.receipt) {
    const receipt = job.payload.receipt;
    return [
      `Receipt: ${receipt.transaction.receiptNumber}`,
      `Cashier: ${receipt.transaction.cashier}`,
      `Total: PHP ${receipt.transaction.grandTotal.toFixed(2)}`,
      `Lines: ${receipt.transaction.lines.length}`,
      '',
      ...receipt.transaction.lines.slice(0, 12).map(line =>
        `${line.qty} x ${line.name} = PHP ${line.total.toFixed(2)}`,
      ),
    ].join('\n');
  }

  if (job.payload.zpl) {
    return job.payload.zpl;
  }

  if (job.payload.rawBytes) {
    return String.fromCharCode(...job.payload.rawBytes.slice(0, 1200));
  }

  return 'Print payload is not available.';
}

export function PrintJobPreviewModal({
  visible,
  job,
  printerType,
  onClose,
  onPrint,
  printing = false,
}: PrintJobPreviewModalProps) {
  React.useEffect(() => {
    if (!visible || !job) return;
    recordPrintPreviewMetadata({
      type: job.type,
      title: job.title,
      sourceId: job.sourceId,
      printerLanguage: job.printerLanguage,
      printerType,
    });
  }, [job, printerType, visible]);

  if (!job) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Print Preview</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{job.title}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeIcon}>
              <Text style={styles.closeIconText}>X</Text>
            </Pressable>
          </View>

          <View style={styles.metaGrid}>
            <Meta label="Type" value={job.type.replace('-', ' ')} />
            <Meta label="Printer" value={getPrinterLanguageLabel(job.printerLanguage)} />
            <Meta label="Connected" value={printerType} />
            <Meta label="Source" value={job.sourceId || 'Local job'} />
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text selectable style={styles.payloadText}>{payloadSummary(job)}</Text>
          </ScrollView>

          <View style={styles.footer}>
            {onPrint ? (
              <Button
                title={printing ? 'Printing...' : 'Print / Retry'}
                onPress={() => onPrint(job)}
                variant="secondary"
                loading={printing}
                disabled={printing}
                style={styles.footerButton}
              />
            ) : null}
            <Button title="Close" onPress={onClose} variant="primary" style={styles.footerButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
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
    maxWidth: 560,
    maxHeight: '88%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerCopy: {
    flex: 1,
    paddingRight: spacing.md,
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
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: 0,
  },
  metaItem: {
    width: '48%',
    minHeight: 50,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metaLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
  },
  metaValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  content: {
    padding: spacing.lg,
  },
  payloadText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
  },
  footerButton: {
    flex: 1,
  },
});
