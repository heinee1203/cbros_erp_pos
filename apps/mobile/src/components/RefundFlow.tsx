import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Animated, StyleSheet, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { v4 as uuid } from 'uuid';
import { BottomSheet, Button, Input, Divider, Icon } from '@/components/ui';
import { useScanner } from '@/hardware/scanner/context';
import { useAuth } from '@/hooks/use-auth';
import { colors, textStyles, spacing, radius, layout } from '@/theme';
import { apiFetch } from '@/services/api-client';
import { logElevation } from '@/services/audit-logger';
import type { RefundAuthorizationMethod, RefundAuthorizationResult } from '@/utils/refund-authorization';
import { formatPosError } from '@/utils/pos-error-messages';
import {
  detectAuthorizationCredentialMethod,
  isCompleteAuthorizationCredentialInput,
  sanitizeAuthorizationCredential,
} from '@/utils/authorization-credentials';

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
  verifyAuthorization: (credential: string, method?: RefundAuthorizationMethod) => Promise<RefundAuthorizationResult>;
}

type Step = 'select-items' | 'select-reason' | 'confirm' | 'pin';

const REASONS = ['Defective', 'Wrong Part', 'Customer Changed Mind', 'Other'] as const;
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];
const MIN_REFUND_NOTE_LENGTH = 5;
type Reason = (typeof REASONS)[number];
type RefundSubmitter = (authorizationOverride?: RefundAuthorizationResult | null) => Promise<void>;

function fmtPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface RefundItem {
  lineId: string;
  selected: boolean;
  quantity: number;
  maxQuantity: number;
  unitPrice: number;
  productName: string;
}

function buildRefundItems(lines: SaleLine[]): RefundItem[] {
  return lines.map(l => {
    const refundable = l.quantity - l.refundedQuantity;
    return {
      lineId: l.id,
      selected: true,
      quantity: refundable,
      maxQuantity: refundable,
      unitPrice: l.quantity > 0 ? l.lineTotal / l.quantity : l.unitPrice,
      productName: l.productName,
    };
  });
}

export function RefundFlow({
  visible, onClose, saleId, saleNo, lines, onRefunded, verifyAuthorization,
}: RefundFlowProps) {
  const styles = createStyles();
  const scanner = useScanner();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('select-items');
  // Only show lines that still have refundable quantity
  const refundableLines = useMemo(() =>
    lines.filter(l => l.quantity - l.refundedQuantity > 0),
    [lines],
  );

  const [items, setItems] = useState<RefundItem[]>(() => buildRefundItems(refundableLines));
  const [reason, setReason] = useState<Reason>('Defective');
  const [otherReason, setOtherReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // PIN state (inline in flow, after confirm)
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [credentialInput, setCredentialInput] = useState('');
  const [credentialStatus, setCredentialStatus] = useState('');
  const [authorization, setAuthorization] = useState<RefundAuthorizationResult | null>(null);
  const credentialInputRef = useRef<TextInput>(null);
  const pinVerifyingRef = useRef(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const refundIdempotencyKeyRef = useRef(uuid());

  const shakePin = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  useEffect(() => {
    if (!visible) return;
    setStep('select-items');
    setItems(buildRefundItems(refundableLines));
    setReason('Defective');
    setOtherReason('');
    setReasonNote('');
    setPin('');
    setPinError('');
    setCredentialInput('');
    setCredentialStatus('');
    pinVerifyingRef.current = false;
    setAuthorization(null);
    setSubmitting(false);
    refundIdempotencyKeyRef.current = uuid();
  }, [visible, refundableLines]);

  // Use ref so handlePinKey can call the latest submitRefund without circular deps
  const submitRef = useRef<RefundSubmitter | undefined>(undefined);

  const authorizeCredential = useCallback(async (
    credential: string,
    method: RefundAuthorizationMethod,
  ) => {
    if (pinVerifyingRef.current || submitting) return;

    pinVerifyingRef.current = true;
    setPinVerifying(true);
    setCredentialStatus(method === 'card' ? 'Card swipe detected' : method === 'barcode' ? 'Manager barcode detected' : '');
    try {
      const result = await verifyAuthorization(credential, method);
      if (result.valid) {
        setAuthorization(result);
        setPin('');
        setPinError('');
        setCredentialInput('');
        setCredentialStatus('');
        await submitRef.current?.(result);
      } else {
        shakePin();
        setPin('');
        setCredentialInput('');
        setCredentialStatus('');
        setPinError(method === 'pin' ? 'Invalid PIN' : 'Card or barcode not authorized');
      }
    } catch {
      shakePin();
      setPin('');
      setCredentialInput('');
      setCredentialStatus('');
      setPinError('Verification failed');
    } finally {
      pinVerifyingRef.current = false;
      setPinVerifying(false);
    }
  }, [shakePin, submitting, verifyAuthorization]);

  const handlePinKey = useCallback(async (key: string) => {
    if (pinVerifyingRef.current) return;
    if (key === 'DEL') {
      setPin(prev => prev.slice(0, -1));
      setPinError('');
      return;
    }
    if (key === '' || pin.length >= 4) return;
    const newPin = pin + key;
    setPin(newPin);
    setPinError('');
    if (newPin.length === 4) {
      await authorizeCredential(newPin, 'pin');
    }
  }, [authorizeCredential, pin]);

  const focusCredentialInput = useCallback(() => {
    if (visible && step === 'pin' && !pinVerifyingRef.current && !submitting) {
      credentialInputRef.current?.focus();
    }
  }, [step, submitting, visible]);

  useEffect(() => {
    if (!visible || step !== 'pin') return;

    setCredentialInput('');
    const focusTimer = setTimeout(focusCredentialInput, 100);
    const refocusTimer = setInterval(focusCredentialInput, 1500);
    scanner.startListening();
    const unsubscribe = scanner.onScan(async (result) => {
      const credential = sanitizeAuthorizationCredential(result.barcode);
      if (!credential) return;
      setPin('');
      setPinError('');
      await authorizeCredential(credential, detectAuthorizationCredentialMethod(credential));
    });

    return () => {
      clearTimeout(focusTimer);
      clearInterval(refocusTimer);
      unsubscribe();
      scanner.stopListening();
    };
  }, [authorizeCredential, focusCredentialInput, scanner, step, visible]);

  const submitCredentialInput = useCallback(async (value: string) => {
    const credential = sanitizeAuthorizationCredential(value);
    if (!credential) return;
    setCredentialInput('');
    await authorizeCredential(credential, detectAuthorizationCredentialMethod(credential));
  }, [authorizeCredential]);

  const handleCredentialInputChange = useCallback((value: string) => {
    setCredentialInput(value);
    setPinError('');
    if (value) setCredentialStatus('Reading credential...');
    if (isCompleteAuthorizationCredentialInput(value)) {
      setTimeout(() => void submitCredentialInput(value), 80);
    }
  }, [submitCredentialInput]);

  const selectedItems = useMemo(() => items.filter(i => i.selected), [items]);
  const selectedUnitCount = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems],
  );
  const refundTotal = useMemo(
    () => selectedItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
    [selectedItems],
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
    setItems(buildRefundItems(refundableLines));
    setReason('Defective');
    setOtherReason('');
    setReasonNote('');
    setPin('');
    setPinError('');
    setCredentialStatus('');
    setAuthorization(null);
    pinVerifyingRef.current = false;
    refundIdempotencyKeyRef.current = uuid();
    onClose();
  };

  const handleSubmit: RefundSubmitter = async (authorizationOverride = null) => {
    if (selectedItems.length === 0) {
      Alert.alert('No items selected', 'Please select at least one item to refund.');
      return;
    }

    const finalReason = reason === 'Other' ? otherReason.trim() : reason;
    const finalNote = reasonNote.trim();
    if (!finalReason) {
      Alert.alert('Reason required', 'Please enter a refund reason.');
      return;
    }
    if (finalNote.length < MIN_REFUND_NOTE_LENGTH) {
      Alert.alert('Inspection Note Required', 'Add a short note for the refund audit trail.');
      return;
    }

    const selectedAuthorization = authorizationOverride ?? authorization;
    const authorizationNote = selectedAuthorization
      ? `Authorized by ${selectedAuthorization.fullName ?? 'manager'} via ${selectedAuthorization.method}`
      : 'Authorization missing';
    const mobileAuditNote = [
      `Mobile refund reason: ${finalReason}`,
      finalNote ? `Cashier note: ${finalNote}` : null,
      authorizationNote,
    ].filter(Boolean).join(' | ');

    setSubmitting(true);
    try {
      await apiFetch(`/sales/${saleId}/refund`, {
        method: 'POST',
        requireLockedLocation: true,
        body: JSON.stringify({
          idempotencyKey: refundIdempotencyKeyRef.current,
          reason: finalReason,
          notes: mobileAuditNote,
          authorizationCredential: selectedAuthorization?.credential,
          authorizationMethod: selectedAuthorization?.method,
          lines: selectedItems.map(i => ({
            saleLineId: i.lineId,
            quantity: i.quantity,
          })),
        }),
      });
      logElevation({
        action: 'refund',
        description: `Refund ${saleNo} for ${fmtPHP(refundTotal)}`,
        approvedBy: selectedAuthorization?.fullName ?? 'Authorized manager',
        performedBy: user?.fullName ?? 'Unknown',
        metadata: {
          saleId,
          saleNo,
          reason: finalReason,
          note: finalNote || undefined,
          refundTotal,
          selectedLineCount: selectedItems.length,
          selectedUnitCount,
          authorizationMethod: selectedAuthorization?.method,
          authorizationUserId: selectedAuthorization?.userId,
          authorizationRole: selectedAuthorization?.role,
          lines: selectedItems.map(i => ({
            saleLineId: i.lineId,
            productName: i.productName,
            quantity: i.quantity,
            maxQuantity: i.maxQuantity,
          })),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales', 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['sales', 'detail', saleId] }),
      ]);
      handleClose();
      onRefunded();
    } catch (err: any) {
      Alert.alert('Refund Failed', formatPosError(err, 'Could not process refund'));
    }
    setSubmitting(false);
  };

  // Keep ref in sync so handlePinKey can call latest handleSubmit
  submitRef.current = handleSubmit;

  const anySelected = selectedItems.length > 0;

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={`Refund ${saleNo}`}>
      {step === 'select-items' && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Select items to refund</Text>
          <View style={styles.auditPanel}>
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>Sale</Text>
              <Text style={styles.auditValue}>{saleNo}</Text>
            </View>
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>Refundable lines</Text>
              <Text style={styles.auditValue}>{items.length}</Text>
            </View>
            <Text style={styles.auditHint}>
              Refunds restore stock and are recorded in the Z-reading accountability section.
            </Text>
          </View>
          {items.length === 0 ? (
            <View style={styles.emptyRefundable}>
              <Text style={styles.emptyRefundableTitle}>No refundable items</Text>
              <Text style={styles.emptyRefundableText}>All lines on this sale have already been refunded.</Text>
            </View>
          ) : (
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
                    {item.selected && <Text style={styles.checkmark}>{'\u2713'}</Text>}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.productName}</Text>
                    <Text style={styles.itemPrice}>
                      {fmtPHP(item.unitPrice)} each / {item.maxQuantity} remaining
                    </Text>
                  </View>
                  {item.selected && (
                    <View style={styles.qtyControls}>
                      <Pressable
                        style={styles.qtyButton}
                        onPress={() => adjustQuantity(item.lineId, -1)}
                      >
                        <Text style={styles.qtyButtonText}>{'\u2212'}</Text>
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
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Refund Total</Text>
            <Text style={styles.totalAmount}>{fmtPHP(refundTotal)}</Text>
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
          <View style={styles.noteBlock}>
            <Text style={styles.fieldLabel}>Inspection note</Text>
            <Input
              value={reasonNote}
              onChangeText={setReasonNote}
              placeholder="Required condition, receipt note, or customer instruction"
              multiline
            />
            <Text style={styles.auditHint}>
              Required. This note is saved with the refund audit and backend sale notes.
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Back"
              variant="secondary"
              onPress={() => setStep('select-items')}
              style={styles.btnBack}
            />
            <Button
              title="Review"
              onPress={() => setStep('confirm')}
              style={styles.btnPrimary}
              disabled={(reason === 'Other' && !otherReason.trim()) || reasonNote.trim().length < MIN_REFUND_NOTE_LENGTH}
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
                <Text style={styles.confirmItemQty}>x{item.quantity}</Text>
              </View>
            ))}
          </View>
          <View style={styles.confirmReason}>
            <Text style={styles.confirmReasonLabel}>Reason:</Text>
            <Text style={styles.confirmReasonValue}>
              {reason === 'Other' ? otherReason : reason}
            </Text>
          </View>
          {reasonNote.trim() ? (
            <View style={styles.confirmReason}>
              <Text style={styles.confirmReasonLabel}>Note:</Text>
              <Text style={styles.confirmReasonValue}>{reasonNote.trim()}</Text>
            </View>
          ) : null}
          <View style={styles.auditPanel}>
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>Items</Text>
              <Text style={styles.auditValue}>
                {selectedItems.length} line{selectedItems.length === 1 ? '' : 's'} / {selectedUnitCount} unit{selectedUnitCount === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>Approval</Text>
              <Text style={styles.auditValue}>Admin or manager required</Text>
            </View>
            <Text style={styles.auditHint}>
              The next screen accepts manager PIN, barcode, or card swipe.
            </Text>
          </View>
          <View style={styles.confirmTotal}>
            <Text style={styles.confirmTotalLabel}>REFUND TOTAL</Text>
            <Text style={styles.confirmTotalAmount}>-{fmtPHP(refundTotal)}</Text>
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Back"
              variant="secondary"
              onPress={() => setStep('select-reason')}
              style={styles.btnBack}
            />
            <Button
              title="Authorize Refund"
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
          <Text style={styles.pinSubtitle}>Enter PIN, swipe manager card, or scan manager barcode</Text>
          <Pressable
            style={[
              styles.credentialPanel,
              (pinVerifying || Boolean(credentialStatus)) && styles.credentialPanelActive,
            ]}
            onPress={focusCredentialInput}
          >
            {pinVerifying ? (
              <ActivityIndicator color={colors.accent.primary} size="small" />
            ) : (
              <View style={styles.credentialIcons}>
                <Icon name="barcode" size={20} color={colors.accent.primary} strokeWidth={2.2} />
                <Icon name="card" size={20} color={colors.accent.primary} strokeWidth={2.2} />
              </View>
            )}
            <View style={styles.credentialCopy}>
              <Text style={styles.credentialTitle}>
                {pinVerifying ? 'Checking authorization' : credentialStatus || 'Scan barcode or swipe card'}
              </Text>
              <Text style={styles.credentialSubtitle}>
                Manager badge or card input is captured automatically.
              </Text>
            </View>
          </Pressable>
          <TextInput
            ref={credentialInputRef}
            value={credentialInput}
            onChangeText={handleCredentialInputChange}
            onSubmitEditing={() => void submitCredentialInput(credentialInput)}
            onBlur={() => setTimeout(focusCredentialInput, 50)}
            autoCapitalize="characters"
            autoCorrect={false}
            blurOnSubmit={false}
            caretHidden
            showSoftInputOnFocus={false}
            style={styles.credentialInput}
          />

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
                <Text style={[styles.pinKeyText, key.length > 1 && styles.pinKeyBackspace]}>
                  {key.length > 1 ? 'DEL' : key}
                </Text>
              </Pressable>
            ))}
          </View>

          {submitting && <Text style={styles.pinSubtitle}>Processing refund...</Text>}

          <View style={styles.buttonRow}>
            <Button
              title="Back"
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
  auditPanel: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  auditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
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
    flex: 1,
    textAlign: 'right',
  },
  auditHint: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  itemList: {
    maxHeight: 250,
  },
  credentialInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  credentialPanel: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  credentialPanelActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  credentialIcons: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.glow,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  credentialCopy: {
    flex: 1,
    minWidth: 0,
  },
  credentialTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  credentialSubtitle: {
    ...textStyles.captionSmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  emptyRefundable: {
    minHeight: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyRefundableTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  emptyRefundableText: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.xs,
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
  noteBlock: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: spacing.xs,
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
    letterSpacing: 0,
    marginBottom: spacing.xs,
  },
  confirmTotalAmount: {
    ...textStyles.display,
    color: colors.status.danger,
  },
  // Inline PIN step
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
