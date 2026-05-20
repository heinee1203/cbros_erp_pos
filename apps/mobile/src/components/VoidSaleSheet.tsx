import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet, Button, Input } from '@/components/ui';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/services/api-client';
import { queryClient } from '@/services/query-client';
import { logElevation } from '@/services/audit-logger';
import { getProtectedActionFreshnessLabel, isProtectedActionFresh } from '@/storage/protected-session';
import { formatPosError } from '@/utils/pos-error-messages';
import { colors, layout, spacing, textStyles } from '@/theme';

interface VoidSaleSheetProps {
  visible: boolean;
  saleId: string | null;
  saleNo: string | null;
  onClose: () => void;
  onVoided: () => void;
}

const VOID_CONFIRMATION = 'VOID';
const MIN_VOID_REASON_LENGTH = 8;
const MIN_VOID_NOTE_LENGTH = 5;
const VOID_REASON_PRESETS = [
  'Customer cancelled',
  'Duplicate sale',
  'Wrong item entered',
  'Training or cashier error',
] as const;

export function VoidSaleSheet({
  visible,
  saleId,
  saleNo,
  onClose,
  onVoided,
}: VoidSaleSheetProps) {
  const styles = createStyles();
  const { can, requiredLevel } = usePosPermission();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [auditNote, setAuditNote] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authorizationVisible, setAuthorizationVisible] = useState(false);
  const trimmedReason = reason.trim();
  const trimmedAuditNote = auditNote.trim();
  const reasonReady = trimmedReason.length >= MIN_VOID_REASON_LENGTH;
  const noteReady = trimmedAuditNote.length >= MIN_VOID_NOTE_LENGTH;
  const confirmationReady = confirmText.trim().toUpperCase() === VOID_CONFIRMATION;
  const canSubmitVoid = reasonReady && noteReady && confirmationReady && !submitting;
  const canVoidWithFreshSession = can('voidSale') && isProtectedActionFresh();

  useEffect(() => {
    if (visible) {
      setReason('');
      setAuditNote('');
      setConfirmText('');
      setAuthorizationVisible(false);
      setSubmitting(false);
    }
  }, [visible, saleId]);

  const closeSheet = useCallback(() => {
    setAuthorizationVisible(false);
    onClose();
  }, [onClose]);

  const submitVoid = useCallback(async (approval?: ManagerAuthorization) => {
    if (!saleId) return;
    if (!reasonReady) {
      Alert.alert('Reason Required', 'Enter a clear reason before voiding this sale.');
      return;
    }
    if (!noteReady) {
      Alert.alert('Audit Note Required', 'Add a short free-text note before voiding this sale.');
      return;
    }
    if (!confirmationReady) {
      Alert.alert('Confirm Void', 'Type VOID before voiding this sale.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/sales/${saleId}/void`, {
        method: 'POST',
        requireLockedLocation: true,
        body: JSON.stringify({
          notes: `${trimmedReason} | Note: ${trimmedAuditNote}`,
          authorizationCredential: approval?.credential,
          authorizationMethod: approval?.method,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      logElevation({
        action: 'void_sale',
        description: `Voided ${saleNo ?? 'sale'}: ${trimmedReason}`,
        approvedBy: approval?.approverName ?? user?.fullName ?? 'Current user',
        performedBy: user?.fullName ?? 'Unknown',
        metadata: {
          saleId,
          saleNo,
          reason: trimmedReason,
          note: trimmedAuditNote,
          authorizationMethod: approval?.method ?? 'session',
          authorizationUserId: approval?.userId ?? user?.id,
          authorizationRole: approval?.role ?? user?.role,
        },
      });
      onVoided();
      closeSheet();
    } catch (err: any) {
      Alert.alert('Void Failed', formatPosError(err, 'Could not void this sale.'));
    } finally {
      setSubmitting(false);
    }
  }, [
    closeSheet,
    confirmationReady,
    onVoided,
    reasonReady,
    noteReady,
    saleId,
    saleNo,
    trimmedAuditNote,
    trimmedReason,
    user?.fullName,
    user?.id,
    user?.role,
  ]);

  const handleVoid = useCallback(() => {
    if (!reasonReady) {
      Alert.alert('Reason Required', 'Enter a clear reason before voiding this sale.');
      return;
    }
    if (!noteReady) {
      Alert.alert('Audit Note Required', 'Add a short free-text note before voiding this sale.');
      return;
    }
    if (!confirmationReady) {
      Alert.alert('Confirm Void', 'Type VOID before voiding this sale.');
      return;
    }

    if (canVoidWithFreshSession) {
      void submitVoid();
      return;
    }

    setAuthorizationVisible(true);
  }, [canVoidWithFreshSession, confirmationReady, noteReady, reasonReady, submitVoid]);

  const handleAuthorizationApproved = useCallback((
    _approverName: string,
    approval?: ManagerAuthorization,
  ) => {
    setAuthorizationVisible(false);
    void submitVoid(approval);
  }, [submitVoid]);

  return (
    <>
      <BottomSheet visible={visible} onClose={closeSheet} title={`Void ${saleNo ?? 'Sale'}`}>
        <View style={styles.content}>
          <View style={styles.guardrailCard}>
            <Text style={styles.guardrailTitle}>Void guardrail</Text>
            <Text style={styles.warning}>
              This is only for unpaid open or parked sales. Completed sales should be handled through refund.
            </Text>
            <View style={styles.guardrailRow}>
              <Text style={styles.guardrailLabel}>Authorization</Text>
              <Text style={styles.guardrailValue}>
                {can('voidSale') ? getProtectedActionFreshnessLabel() : 'Manager required'}
              </Text>
            </View>
            <View style={styles.guardrailRow}>
              <Text style={styles.guardrailLabel}>Confirmation</Text>
              <Text style={styles.guardrailValue}>Type {VOID_CONFIRMATION}</Text>
            </View>
          </View>
          {!canVoidWithFreshSession && (
            <Text style={styles.authorizationHint}>
              Fresh manager authorization will be required after the reason is entered.
            </Text>
          )}
          <View style={styles.reasonPresetRow}>
            {VOID_REASON_PRESETS.map(preset => (
              <Pressable
                key={preset}
                style={[
                  styles.reasonPreset,
                  reason === preset && styles.reasonPresetActive,
                ]}
                onPress={() => setReason(preset)}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Text style={[
                  styles.reasonPresetText,
                  reason === preset && styles.reasonPresetTextActive,
                ]}>
                  {preset}
                </Text>
              </Pressable>
            ))}
          </View>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="Reason for voiding..."
            multiline
            autoFocus
          />
          <Text style={[
            styles.readinessHint,
            reasonReady ? styles.readinessHintReady : styles.readinessHintBlocked,
          ]}>
            {reasonReady
              ? 'Reason is ready for audit.'
              : `Enter at least ${MIN_VOID_REASON_LENGTH} characters for the audit reason.`}
          </Text>
          <Input
            value={auditNote}
            onChangeText={setAuditNote}
            placeholder="Required audit note..."
            multiline
          />
          <Text style={[
            styles.readinessHint,
            noteReady ? styles.readinessHintReady : styles.readinessHintBlocked,
          ]}>
            {noteReady
              ? 'Audit note is ready.'
              : `Add at least ${MIN_VOID_NOTE_LENGTH} characters explaining the void.`}
          </Text>
          <Input
            value={confirmText}
            onChangeText={(value) => setConfirmText(value.toUpperCase())}
            placeholder={`Type ${VOID_CONFIRMATION} to confirm`}
            returnKeyType="done"
          />
          <Text style={[
            styles.readinessHint,
            confirmationReady ? styles.readinessHintReady : styles.readinessHintBlocked,
          ]}>
            {confirmationReady ? 'Confirmation accepted.' : 'This prevents accidental voids.'}
          </Text>
          <View style={styles.actions}>
            <Button title="Cancel" variant="secondary" onPress={closeSheet} style={styles.actionButton} />
            <Button
              title={canVoidWithFreshSession ? 'Void Sale' : 'Authorize Void'}
              variant="danger"
              onPress={handleVoid}
              loading={submitting}
              disabled={!canSubmitVoid}
              style={styles.actionButton}
            />
          </View>
        </View>
      </BottomSheet>
      <ManagerPinModal
        visible={authorizationVisible}
        action={`Void ${saleNo ?? 'sale'}`}
        requiredLevel={requiredLevel('voidSale')}
        onApprove={handleAuthorizationApproved}
        onCancel={() => setAuthorizationVisible(false)}
      />
    </>
  );
}

const createStyles = () => StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  guardrailCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.status.warning,
    backgroundColor: colors.status.warningBg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  guardrailTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  warning: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  guardrailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  guardrailLabel: {
    ...textStyles.captionSmall,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  guardrailValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'right',
  },
  authorizationHint: {
    ...textStyles.caption,
    color: colors.status.warningText,
  },
  reasonPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reasonPreset: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  reasonPresetActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  reasonPresetText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  reasonPresetTextActive: {
    color: colors.accent.primary,
  },
  readinessHint: {
    ...textStyles.captionSmall,
    marginTop: -spacing.sm,
  },
  readinessHintReady: {
    color: colors.status.successText,
  },
  readinessHintBlocked: {
    color: colors.text.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
