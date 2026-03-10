import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { v4 as uuid } from 'uuid';
import { BottomSheet, Button, Chip, Input, Divider } from '@/components/ui';
import { colors, textStyles, spacing, radius, layout } from '@/theme';
import { apiFetch } from '@/services/api-client';

interface SaleLine {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface RefundFlowProps {
  visible: boolean;
  onClose: () => void;
  saleId: string;
  saleNo: string;
  lines: SaleLine[];
  onRefunded: () => void;
}

type Step = 'select-items' | 'select-reason' | 'confirm';

const REASONS = ['Defective', 'Wrong Part', 'Customer Changed Mind', 'Other'] as const;
type Reason = (typeof REASONS)[number];

interface RefundItem {
  lineId: string;
  selected: boolean;
  quantity: number;
  maxQuantity: number;
  unitPrice: number;
  productName: string;
}

export function RefundFlow({
  visible, onClose, saleId, saleNo, lines, onRefunded,
}: RefundFlowProps) {
  const [step, setStep] = useState<Step>('select-items');
  const [items, setItems] = useState<RefundItem[]>(() =>
    lines.map(l => ({
      lineId: l.id,
      selected: true,
      quantity: l.quantity,
      maxQuantity: l.quantity,
      unitPrice: l.unitPrice,
      productName: l.productName,
    })),
  );
  const [reason, setReason] = useState<Reason>('Defective');
  const [otherReason, setOtherReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refundTotal = useMemo(() =>
    items
      .filter(i => i.selected)
      .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
    [items],
  );

  const toggleItem = (lineId: string) => {
    setItems(prev => prev.map(i =>
      i.lineId === lineId ? { ...i, selected: !i.selected } : i,
    ));
  };

  const adjustQuantity = (lineId: string, delta: number) => {
    setItems(prev => prev.map(i => {
      if (i.lineId !== lineId) return i;
      const newQty = Math.max(1, Math.min(i.maxQuantity, i.quantity + delta));
      return { ...i, quantity: newQty };
    }));
  };

  const handleClose = () => {
    setStep('select-items');
    setItems(lines.map(l => ({
      lineId: l.id,
      selected: true,
      quantity: l.quantity,
      maxQuantity: l.quantity,
      unitPrice: l.unitPrice,
      productName: l.productName,
    })));
    setReason('Defective');
    setOtherReason('');
    onClose();
  };

  const handleSubmit = async () => {
    const selectedItems = items.filter(i => i.selected);
    if (selectedItems.length === 0) {
      Alert.alert('No items selected', 'Please select at least one item to refund.');
      return;
    }

    const finalReason = reason === 'Other' ? otherReason.trim() : reason;
    if (!finalReason) {
      Alert.alert('Reason required', 'Please enter a refund reason.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/sales/${saleId}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: uuid(),
          reason: finalReason,
          lines: selectedItems.map(i => ({
            saleLineId: i.lineId,
            quantity: i.quantity,
          })),
        }),
      });
      handleClose();
      onRefunded();
    } catch (err: any) {
      Alert.alert('Refund Failed', err.message || 'Could not process refund');
    }
    setSubmitting(false);
  };

  const anySelected = items.some(i => i.selected);

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={`Refund ${saleNo}`}>
      {step === 'select-items' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Select items to refund</Text>
          <ScrollView style={styles.itemList}>
            {items.map(item => (
              <View key={item.lineId}>
                <Pressable
                  style={styles.itemRow}
                  onPress={() => toggleItem(item.lineId)}
                >
                  <View style={[
                    styles.checkbox,
                    item.selected && styles.checkboxChecked,
                  ]}>
                    {item.selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.productName}</Text>
                    <Text style={styles.itemPrice}>
                      {'\u20B1'}{item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  {item.selected && (
                    <View style={styles.qtyControls}>
                      <Pressable
                        style={styles.qtyButton}
                        onPress={() => adjustQuantity(item.lineId, -1)}
                      >
                        <Text style={styles.qtyButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <Pressable
                        style={styles.qtyButton}
                        onPress={() => adjustQuantity(item.lineId, 1)}
                      >
                        <Text style={styles.qtyButtonText}>+</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
                <Divider />
              </View>
            ))}
          </ScrollView>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Refund Total</Text>
            <Text style={styles.totalAmount}>
              {'\u20B1'}{refundTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </Text>
          </View>

          <Button
            title="Next: Select Reason"
            onPress={() => setStep('select-reason')}
            disabled={!anySelected}
            fullWidth
          />
        </View>
      )}

      {step === 'select-reason' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Reason for refund</Text>
          <View style={styles.reasonChips}>
            {REASONS.map(r => (
              <Chip
                key={r}
                label={r}
                active={reason === r}
                onPress={() => setReason(r)}
              />
            ))}
          </View>
          {reason === 'Other' && (
            <View style={styles.otherInput}>
              <Input
                value={otherReason}
                onChangeText={setOtherReason}
                placeholder="Describe the reason..."
                multiline
              />
            </View>
          )}
          <View style={styles.buttonRow}>
            <Button
              title="Back"
              variant="ghost"
              onPress={() => setStep('select-items')}
              style={{ flex: 1 }}
            />
            <Button
              title="Review"
              onPress={() => setStep('confirm')}
              style={{ flex: 2 }}
              disabled={reason === 'Other' && !otherReason.trim()}
            />
          </View>
        </View>
      )}

      {step === 'confirm' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Confirm Refund</Text>
          <View style={styles.confirmSummary}>
            {items.filter(i => i.selected).map(item => (
              <View key={item.lineId} style={styles.confirmItem}>
                <Text style={styles.confirmItemName}>{item.productName}</Text>
                <Text style={styles.confirmItemQty}>×{item.quantity}</Text>
              </View>
            ))}
          </View>
          <View style={styles.confirmReason}>
            <Text style={styles.confirmReasonLabel}>Reason:</Text>
            <Text style={styles.confirmReasonValue}>
              {reason === 'Other' ? otherReason : reason}
            </Text>
          </View>
          <View style={styles.confirmTotal}>
            <Text style={styles.confirmTotalLabel}>REFUND TOTAL</Text>
            <Text style={styles.confirmTotalAmount}>
              −{'\u20B1'}{refundTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Back"
              variant="ghost"
              onPress={() => setStep('select-reason')}
              style={{ flex: 1 }}
            />
            <Button
              title="Confirm Refund"
              variant="danger"
              onPress={handleSubmit}
              loading={submitting}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stepContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
  },
  stepTitle: {
    ...textStyles.subheading,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  itemList: {
    maxHeight: 250,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  checkmark: {
    color: colors.text.inverse,
    fontSize: 14,
    fontWeight: '700',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  itemPrice: {
    ...textStyles.monoSm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    ...textStyles.bodyMedium,
    color: colors.accent.primary,
  },
  qtyText: {
    ...textStyles.monoMd,
    color: colors.text.primary,
    minWidth: 24,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  totalLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  totalAmount: {
    ...textStyles.monoLg,
    color: colors.status.danger,
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  otherInput: {
    marginBottom: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  confirmSummary: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  confirmItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  confirmItemName: {
    ...textStyles.body,
    color: colors.text.primary,
    flex: 1,
  },
  confirmItemQty: {
    ...textStyles.monoMd,
    color: colors.text.secondary,
  },
  confirmReason: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  confirmReasonLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  confirmReasonValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
  },
  confirmTotal: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.status.dangerBg,
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  confirmTotalLabel: {
    ...textStyles.caption,
    color: colors.status.danger,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  confirmTotalAmount: {
    ...textStyles.display,
    color: colors.status.danger,
  },
});
