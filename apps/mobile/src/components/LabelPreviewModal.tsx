import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, textStyles } from '@/theme';
import { Button } from '@/components/ui';

interface LabelPreviewModalProps {
  visible: boolean;
  itemName: string;
  barcode: string;
  sku?: string | null;
  price?: number | null;
  copies?: number;
  zpl: string;
  onClose: () => void;
  onPrint?: () => void;
  printing?: boolean;
  statusLabel?: string;
}

function fmtPHP(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '';
  return `\u20B1${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LabelPreviewModal({
  visible,
  itemName,
  barcode,
  sku,
  price,
  copies = 1,
  zpl,
  onClose,
  onPrint,
  printing = false,
  statusLabel,
}: LabelPreviewModalProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Label Preview</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {sku || barcode}{copies > 1 ? ` / ${copies} copies` : ''}
              </Text>
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

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.labelCanvas}>
              <Text style={styles.labelName} numberOfLines={2}>{itemName}</Text>
              <View style={styles.barcodePreview}>
                {Array.from({ length: 28 }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.bar,
                      { width: index % 5 === 0 ? 4 : index % 2 === 0 ? 2 : 1 },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.barcodeText}>{barcode}</Text>
              <View style={styles.labelDetailRow}>
                {sku ? <Text style={styles.labelDetail} numberOfLines={1}>{sku}</Text> : <View />}
                {fmtPHP(price) ? <Text style={styles.labelPrice}>{fmtPHP(price)}</Text> : null}
              </View>
            </View>

            <View style={styles.zplBox}>
              <Text style={styles.zplTitle}>ZPL</Text>
              <Text style={styles.zplText}>{zpl}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {onPrint ? (
              <Button
                title={printing ? 'Printing...' : copies > 1 ? `Print ${copies} Labels` : 'Print Label'}
                onPress={onPrint}
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
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
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
  title: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginTop: 2,
    maxWidth: 360,
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  labelCanvas: {
    aspectRatio: 1.9,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  labelName: {
    ...textStyles.bodyMedium,
    color: colors.black,
    textAlign: 'center',
  },
  barcodePreview: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: spacing.xs,
  },
  bar: {
    height: '100%',
    backgroundColor: colors.black,
  },
  barcodeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.black,
    textAlign: 'center',
  },
  labelDetailRow: {
    minHeight: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  labelDetail: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.black,
    flex: 1,
  },
  labelPrice: {
    ...textStyles.bodyMedium,
    color: colors.black,
  },
  zplBox: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.primary,
    padding: spacing.md,
  },
  zplTitle: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    marginBottom: spacing.xs,
  },
  zplText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.text.secondary,
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
