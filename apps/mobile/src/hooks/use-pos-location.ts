import { useState, useCallback, useMemo } from 'react';
import { getDeviceBinding, type DeviceBinding } from '@/config/device-binding';
import { useAuth } from './use-auth';

/**
 * Hook for getting the current POS location.
 *
 * Priority:
 * 1. Manager temporary override (session-only, Zustand state)
 * 2. Device binding (persisted in MMKV)
 * 3. Auth context locationId (fallback)
 *
 * Override resets on component unmount / logout / app restart.
 */
export function usePosLocation() {
  const binding = useMemo(() => getDeviceBinding(), []);
  const { locationId: authLocationId } = useAuth();
  const [override, setOverride] = useState<{ id: string; name: string } | null>(null);

  const locationId = override?.id ?? binding?.locationId ?? authLocationId;
  const locationName = override?.name ?? binding?.locationName ?? '';
  const locationCode = binding?.locationCode ?? '';
  const isOverridden = !!override;

  const setLocationOverride = useCallback((id: string, name: string) => {
    setOverride({ id, name });
  }, []);

  const clearOverride = useCallback(() => {
    setOverride(null);
  }, []);

  return {
    locationId,
    locationName,
    locationCode,
    isOverridden,
    isBound: !!binding,
    binding,
    setLocationOverride,
    clearOverride,
  };
}
