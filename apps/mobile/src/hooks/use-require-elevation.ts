import { useState, useCallback } from 'react';
import { usePosPermission } from './use-pos-permission';
import type { PosPermission } from '@/config/pos-permissions';
import type { ManagerAuthorization } from '@/components/ManagerPinModal';
import { useAuth } from '@/hooks/use-auth';
import { isProtectedActionFresh } from '@/storage/protected-session';

interface ElevationRequest {
  permission: PosPermission;
  action: string;
  requiredLevel: number;
  onApprove: (approverName: string, approval?: ManagerAuthorization) => void;
}

/**
 * Gates protected POS actions behind manager approval.
 * A privileged cashier may continue only while the recent approval window is fresh.
 */
export function useRequireElevation() {
  const { can, requiredLevel: getRequiredLevel } = usePosPermission();
  const { user } = useAuth();
  const [request, setRequest] = useState<ElevationRequest | null>(null);

  const guard = useCallback((
    permission: PosPermission,
    actionDescription: string,
    onApproved: (approverName: string, approval?: ManagerAuthorization) => void,
  ) => {
    if (can(permission) && isProtectedActionFresh()) {
      onApproved(user?.fullName ?? user?.email ?? 'Self');
      return;
    }

    setRequest({
      permission,
      action: actionDescription,
      requiredLevel: getRequiredLevel(permission),
      onApprove: (approverName: string, approval?: ManagerAuthorization) => {
        onApproved(approverName, approval);
        setRequest(null);
      },
    });
  }, [can, getRequiredLevel, user?.email, user?.fullName]);

  const cancel = useCallback(() => setRequest(null), []);

  return {
    guard,
    elevationProps: {
      visible: request !== null,
      action: request?.action ?? '',
      requiredLevel: request?.requiredLevel ?? 2,
      onApprove: request?.onApprove ?? (() => {}),
      onCancel: cancel,
    },
  };
}
