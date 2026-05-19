import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { PinPad } from './PinPad';
import { apiFetch } from '@/services/api-client';
import { formatPosError } from '@/utils/pos-error-messages';
import { getAuthorizationMethodLabel } from '@/utils/authorization-credentials';
import { colors, spacing, radius, fonts, fontSize } from '@/theme';
import { Icon } from '@/components/ui';

interface ManagerPinModalProps {
  visible: boolean;
  action: string;             // "Apply 10% discount" — shown in the modal
  requiredLevel?: number;     // minimum role level needed (default 2)
  onApprove: (approverName: string, approval?: ManagerAuthorization) => void;
  onCancel: () => void;
}

export interface ManagerAuthorization {
  approverName: string;
  userId?: string;
  role?: string;
  credential: string;
  method: 'pin' | 'barcode' | 'card';
}

/**
 * ManagerPinModal — wraps PinPad for permission elevation.
 *
 * When a cashier tries an action above their role level,
 * this modal asks for a manager/admin PIN, barcode, or card swipe.
 * Validates via API POST /auth/verify-authorization.
 */
export function ManagerPinModal({
  visible,
  action,
  requiredLevel = 2,
  onApprove,
  onCancel,
}: ManagerPinModalProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setError(null);
  }, [visible, action]);

  const verifyAuthorization = useCallback(async (
    credential: string,
    method: 'pin' | 'barcode' | 'card',
  ): Promise<boolean> => {
    try {
      const result = await apiFetch<{
        valid: boolean;
        userId?: string;
        fullName?: string;
        role?: string;
      }>('/auth/verify-authorization', {
        method: 'POST',
        body: JSON.stringify({ credential, method }),
      });

      if (!result.valid) {
        setError(`${getAuthorizationMethodLabel(method)} not authorized`);
        return false;
      }

      // Check role level
      const roleLevel = getRoleLevel(result.role ?? '');
      if (roleLevel < requiredLevel) {
        setError(`Requires ${getRequiredRoleLabel(requiredLevel)} authorization`);
        return false;
      }

      const approverName = result.fullName ?? 'Manager';
      setError(null);
      onApprove(approverName, {
        approverName,
        userId: result.userId,
        role: result.role,
        credential,
        method,
      });
      return true;
    } catch (err: any) {
      setError(formatPosError(err, 'Authorization failed'));
      return false;
    }
  }, [requiredLevel, onApprove]);

  const verifyPin = useCallback((pin: string) =>
    verifyAuthorization(pin, 'pin'),
  [verifyAuthorization]);

  const verifyCredential = useCallback((credential: string, method: 'barcode' | 'card') =>
    verifyAuthorization(credential, method),
  [verifyAuthorization]);

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
            <View style={styles.iconBadge}>
              <Icon name="alert" size={24} color={colors.status.warning} strokeWidth={2.4} />
            </View>
            <Text style={styles.title}>Manager Authorization Required</Text>
            <Text style={styles.subtitle}>
              {getRequiredRoleLabel(requiredLevel)} approval accepts PIN, manager barcode, or card swipe.
            </Text>
          </View>

          {/* Action description */}
          <View style={styles.actionBox}>
            <View style={styles.actionHeader}>
              <Text style={styles.actionLabel}>Requested Action</Text>
              <Text style={styles.rolePill}>{getRequiredRoleLabel(requiredLevel)}</Text>
            </View>
            <Text style={styles.actionText}>{action}</Text>
          </View>

          <View style={styles.methodRow}>
            <View style={styles.methodChip}>
              <Text style={styles.methodText}>PIN</Text>
            </View>
            <View style={styles.methodChip}>
              <Icon name="barcode" size={16} color={colors.accent.primary} />
              <Text style={styles.methodText}>Barcode</Text>
            </View>
            <View style={styles.methodChip}>
              <Icon name="card" size={16} color={colors.accent.primary} />
              <Text style={styles.methodText}>Card</Text>
            </View>
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
            verifyCredential={verifyCredential}
            embedded
            subtitle={`${getRequiredRoleLabel(requiredLevel)} approval`}
            onVerified={() => {}} // handled in verifyPin callback
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getRoleLevel(role: string): number {
  switch (role.toUpperCase()) {
    case 'ADMIN': return 3;
    case 'MANAGER': return 2;
    default: return 1;
  }
}

function getRequiredRoleLabel(requiredLevel: number): string {
  return requiredLevel >= 3 ? 'Admin' : 'Manager';
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.46)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.status.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.primary,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  actionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.medium,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  rolePill: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body.medium,
    color: colors.accent.primary,
    backgroundColor: colors.accent.muted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  actionText: {
    fontSize: fontSize.base,
    fontFamily: fonts.body.medium,
    color: colors.text.primary,
  },
  methodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  methodChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  methodText: {
    fontSize: fontSize.sm,
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
