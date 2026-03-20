import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Animated, StyleSheet, Alert } from 'react-native';
import { v4 as uuid } from 'uuid';
import { BottomSheet, Button, Input, Divider } from '@/components/ui';
import { colors, textStyles, spacing, radius, layout } from '@/theme';
import { apiFetch } from '@/services/api-client';

interface SaleLine {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  refundedQuantity: number;
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
  verifyPin: (pin: string) => Promise<boolean>;
}

type Step = 'select-items' | 'select-reason' | 'confirm' | 'pin';

const REASONS = ['Defective', 'Wrong Part', 'Customer Changed Mind', 'Other'] as const;
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
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
  visible, onClose, saleId, saleNo, lines, onRefunded, verifyPin,
}: RefundFlowProps) {
  const styles = createStyles();
  const [step, setStep] = useState<Step>('select-items');
  // Only show lines that still have refundable quantity
  const refundableLines = useMemo(() =>
    lines.filter(l => l.quantity - l.refundedQuantity > 0),
    [lines],
  );

  const [items, setItems] = useState<RefundItem[]>(() =>
    refundableLines.map(l => {
      const refundable = l.quantity - l.refundedQuantity;
      return {
        lineId: l.id,
        selected: true,
        quantity: refundable,
        maxQuantity: refundable,
        unitPrice: l.unitPrice,
        productName: l.productName,
      };
    }),
  );
  const [reason, setReason] = useState<Reason>('Defective');
  const [otherReason, setOtherReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // PIN state (inline in flow, after confirm)
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shakePin = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // Use ref so handlePinKey can call the latest submitRefund without circular deps
  const submitRef = useRef<() => Promise<void>>();

  const handlePinKey = useCallback(async (key: string) => {
    if (pinVerifying) return;
    if (key === '⌫') {
      setPin(prev => prev.slice(0, -1));
      setPinError('');
      return;
    }
    if (key === '' || pin.length >= 4) return;
    const newPin = pin + key;
    setPin(newPin);
    setPinError('');
    if (newPin.length === 4) {
      setPinVerifying(true);
      try {
        const valid = await verifyPin(newPin);
        if (valid) {
          setPin('');
          setPinError('');
          // PIN verified — submit the refund
          await submitRef.current?.();
        } else {
          shakePin();
          setPin('');
          setPinError('Invalid PIN');
        }
      } catch {
        shakePin();
        setPin('');
        setPinError('Verification failed');
      }
      setPinVerifying(false);
    }
  }, [pin, pinVerifying, verifyPin, shakePin]);

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
    setItems(refundableLines.map(l => {
      const refundable = l.quantity - l.refundedQuantity;
      return {
        lineId: l.id,
        selected: true,
        quantity: refundable,
        maxQuantity: refundable,
        unitPrice: l.unitPrice,
        productName: l.productName,
      };
    }));
    setReason('Defective');
    setOtherReason('');
    setPin('');
    setPinError('');
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

  // Keep ref in sync so handlePinKey can call latest handleSubmit
  submitRef.current = handleSubmit;

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
          <View style={styles.reasonGrid}>
            {REASONS.map(r => (
              <Pressable
                key={r}
                style={[styles.reasonButton, reason === r && styles.reasonButtonActive]}
                onPress={() => setReason(r)}
              >
                <Text
                  style={[styles.reasonButtonText, reason === r && styles.reasonButtonTextActive]}
                >
                  {r}
                </Text>
              </Pressable>
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
              title="← Back"
              variant="secondary"
              onPress={() => setStep('select-items')}
              style={styles.btnBack}
            />
            <Button
              title="Review →"
              onPress={() => setStep('confirm')}
              style={styles.btnPrimary}
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
              title="← Back"
              variant="secondary"
              onPress={() => setStep('select-reason')}
              style={styles.btnBack}
            />
            <Button
              title="Authorize Refund →"
              variant="danger"
              onPress={() => { setPin(''); setPinError(''); setStep('pin'); }}
              style={styles.btnPrimary}
            />
          </View>
        </View>
      )}

      {step === 'pin' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Manager Authorization</Text>
          <Text style={styles.pinSubtitle}>Enter 4-digit PIN to authorize this refund</Text>

          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map(i => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < pin.length && styles.dotFilled,
                  pinError ? styles.dotError : undefined,
                ]}
              />
            ))}
          </Animated.View>

          {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : <View style={styles.pinErrorSpacer} />}

          <View style={styles.pinKeypad}>
            {PIN_KEYS.map((key, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.pinKey,
                  key === '' && styles.pinKeyEmpty,
                  key !== '' && pressed && styles.pinKeyPressed,
                ]}
                onPress={() => handlePinKey(key)}
                disabled={key === '' || pinVerifying || submitting}
                android_ripple={key !== '' ? { color: colors.accent.glow } : undefined}
              >
                <Text style={[styles.pinKeyText, key === '⌫' && styles.pinKeyBackspace]}>
                  {key}
                </Text>
              </Pressable>
            ))}
          </View>

          {submitting && <Text style={styles.pinSubtitle}>Processing refund…</Text>}

          <View style={styles.buttonRow}>
            <Button
              title="← Back"
              variant="secondary"
              onPress={() => setStep('confirm')}
              style={styles.btnBack}
              disabled={submitting}
            />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const createStyles = () => StyleSheet.create({
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
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  reasonButton: {
    width: '48%',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonButtonActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.primary,
  },
  reasonButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  reasonButtonTextActive: {
    color: colors.text.inverse,
  },
  otherInput: {
    marginBottom: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  btnBack: {
    flex: 1,
    minHeight: 48,
  },
  btnPrimary: {
    flex: 2,
    minHeight: 48,
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
  // ── Inline PIN step ──
  pinSubtitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border.default,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  dotError: {
    borderColor: colors.status.danger,
  },
  pinErrorText: {
    ...textStyles.captionSmall,
    color: colors.status.danger,
    textAlign: 'center',
    height: 20,
    marginBottom: spacing.md,
  },
  pinErrorSpacer: {
    height: 20,
    marginBottom: spacing.md,
  },
  pinKeypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 240,
    alignSelf: 'center',
    gap: spacing.sm,
  },
  pinKey: {
    width: 72,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinKeyEmpty: {
    backgroundColor: 'transparent',
  },
  pinKeyPressed: {
    backgroundColor: colors.border.default,
  },
  pinKeyText: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  pinKeyBackspace: {
    fontSize: 22,
  },
});
