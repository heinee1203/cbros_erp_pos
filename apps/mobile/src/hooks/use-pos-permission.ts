import { useCallback, useMemo } from 'react';
import { useAuth } from './use-auth';
import { ROLE_LEVEL, POS_PERMISSIONS, type PosPermission } from '@/config/pos-permissions';

/**
 * Hook for checking POS permissions based on the current user's role.
 *
 * Usage:
 *   const { can, requiresElevation, userLevel } = usePosPermission();
 *   if (can('processRefund')) { ... }
 *   if (requiresElevation('applyLineDiscount15')) { showPinModal(); }
 */
export function usePosPermission() {
  const { user } = useAuth();

  const userLevel = useMemo(
    () => ROLE_LEVEL[user?.role ?? 'CASHIER'] ?? 1,
    [user?.role],
  );

  const can = useCallback(
    (permission: PosPermission): boolean => {
      return userLevel >= POS_PERMISSIONS[permission];
    },
    [userLevel],
  );

  const requiresElevation = useCallback(
    (permission: PosPermission): boolean => {
      return userLevel < POS_PERMISSIONS[permission];
    },
    [userLevel],
  );

  /**
   * Get the required level for a permission.
   * Useful for passing to the ManagerPinModal's requiredLevel prop.
   */
  const requiredLevel = useCallback(
    (permission: PosPermission): number => {
      return POS_PERMISSIONS[permission];
    },
    [],
  );

  return {
    can,
    requiresElevation,
    requiredLevel,
    userLevel,
    userRole: user?.role ?? 'CASHIER',
  };
}
