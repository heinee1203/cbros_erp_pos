import React, { useState, useCallback } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { PinPad } from './PinPad';
import { apiFetch } from '@/services/api-client';
import { colors, spacing, radius, fonts, fontSize } from '@/theme';

interface ManagerPinModalProps {
  visible: boolean;
  action: string;             // "Apply 10% discount" — shown in the modal
  requiredLevel?: number;     // minimum role level needed (default 2)
  onApprove: (approverName: string) => void;
  onCancel: () => void;
}

/**
 * ManagerPinModal — wraps PinPad for permission elevation.
 *
 * When a cashier tries an action above their role level,
 * this modal asks for a manager/admin PIN.
 * Validates via API POST /auth/verify-pin.
 */
export function ManagerPinModal({
  visible,
  action,
  requiredLevel = 2,
  onApprove,
  onCancel,
}: ManagerPinModalProps) {
  const [error, setError] = useState<string | null>(null);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const result = await apiFetch<{
        valid: boolean;
        userId?: string;
        fullName?: string;
        role?: string;
      }>('/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });

      if (!result.valid) {
        setError('Invalid PIN');
        return false;
      }

      // Check role level
      const roleLevel = getRoleLevel(result.role ?? '');
      if (roleLevel < requiredLevel) {
        setError(`Requires ${requiredLevel >= 3 ? 'Admin' : 'Manager'} authorization`);
        return false;
      }

      setError(null);
      onApprove(result.fullName ?? 'Manager');
      return true;
    } catch (err: any) {
      setError(err.message || 'PIN verification failed');
      return false;
    }
  }, [requiredLevel, onApprove]);

  const handleCancel = useCallback(() => {
    setError(null);
    onCancel();
  }, [onCancel]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.overlay} onPress={handleCancel}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.lockIcon}>{'\uD83D\uDD12'}</Text>
            <Text style={styles.title}>Manager Authorization Required</Text>
            <Text style={styles.subtitle}>
              Enter {requiredLevel >= 3 ? 'Admin' : 'Manager'} PIN to continue
            </Text>
          </View>

          {/* Action description */}
          <View style={styles.actionBox}>
            <Text style={styles.actionLabel}>Requested Action</Text>
            <Text style={styles.actionText}>{action}</Text>
          </View>

          {/* Error */}
          {error && (
            <Text style={styles.error}>{error}</Text>
          )}

          {/* PIN pad */}
          <PinPad
            visible={true}
            onClose={handleCancel}
            verifyPin={verifyPin}
            onVerified={() => {}} // handled in verifyPin callback
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getRoleLevel(role: string): number {
  switch (role) {
    case 'ADMIN': return 3;
    case 'MANAGER': return 2;
    default: return 1;
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: 360,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.display.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  actionBox: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.primary,
  },
  actionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.medium,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.base,
    fontFamily: fonts.body.medium,
    color: colors.text.primary,
  },
  error: {
    fontSize: fontSize.sm,
    color: colors.status.danger,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
