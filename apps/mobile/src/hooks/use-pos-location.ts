import { useMemo } from 'react';
import { getDeviceBinding, type DeviceBinding } from '@/config/device-binding';
import { useAuth } from './use-auth';

/**
 * Hook for getting the current POS location.
 *
 * Priority:
 * 1. Device binding (persisted in MMKV)
 * 2. Auth context locationId (fallback before first-time registration)
 */
export function usePosLocation() {
  const binding = useMemo(() => getDeviceBinding(), []);
  const { locationId: authLocationId } = useAuth();

  const locationId = binding?.locationId ?? authLocationId;
  const locationName = binding?.locationName ?? '';
  const locationCode = binding?.locationCode ?? '';

  return {
    locationId,
    locationName,
    locationCode,
    isOverridden: false,
    isBound: !!binding,
    binding,
    setLocationOverride: undefined,
    clearOverride: undefined,
  };
}
