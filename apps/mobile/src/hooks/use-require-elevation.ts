import { useState, useCallback } from 'react';
import { usePosPermission } from './use-pos-permission';
import type { PosPermission } from '@/config/pos-permissions';

interface ElevationRequest {
  permission: PosPermission;
  action: string;
  requiredLevel: number;
  onApprove: (approverName: string) => void;
}

/**
 * Hook that gates an action behind manager PIN verification
 * when the current user lacks the required permission level.
 *
 * Usage:
 *   const { guard, elevationProps } = useRequireElevation();
 *
 *   // In handler:
 *   guard('priceOverride', 'Override price on Brake Pad', (approverName) => {
 *     store.setLinePriceOverride(lineId, newPrice, approverName);
 *   });
 *
 *   // In JSX:
 *   <ManagerPinModal {...elevationProps} />
 */
export function useRequireElevation() {
  const { can, requiredLevel: getRequiredLevel } = usePosPermission();
  const [request, setRequest] = useState<ElevationRequest | null>(null);

  const guard = useCallback((
    permission: PosPermission,
    actionDescription: string,
    onApproved: (approverName: string) => void,
  ) => {
    if (can(permission)) {
      // User has permission — execute immediately with their own name
      onApproved('Self');
      return;
    }
    // Need elevation — show PIN modal
    setRequest({
      permission,
      action: actionDescription,
      requiredLevel: getRequiredLevel(permission),
      onApprove: (approverName: string) => {
        onApproved(approverName);
        setRequest(null);
      },
    });
  }, [can, getRequiredLevel]);

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
