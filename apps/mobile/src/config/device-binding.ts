import { storage, getJSON, setJSON } from '@/storage/mmkv';

const KEY = 'device_binding';

export interface DeviceBinding {
  locationId: string;
  locationName: string;
  locationCode: string;
  boundAt: string;      // ISO timestamp
  boundBy: string;      // manager name who set it up
  registrationCodeRef?: string;
  deviceId?: string;
}

/**
 * Get the current device store binding.
 * Returns null if device hasn't been bound to a store yet.
 */
export function getDeviceBinding(): DeviceBinding | null {
  return getJSON<DeviceBinding>(storage, KEY) ?? null;
}

export function getLockedLocationId(): string | null {
  return getDeviceBinding()?.locationId ?? null;
}

export function requireLockedLocationId(action = 'This POS action'): string {
  const locationId = getLockedLocationId();
  if (!locationId) {
    throw new Error(`${action} requires this register to be locked to a store. Register the device before continuing.`);
  }
  return locationId;
}

export function isLockedToLocation(locationId?: string | null): boolean {
  const lockedLocationId = getLockedLocationId();
  return !!lockedLocationId && lockedLocationId === locationId;
}

export function bindDeviceToLocation(
  location: { id: string; name: string; code: string },
  boundBy: string,
  metadata?: { registrationCodeRef?: string; deviceId?: string },
): DeviceBinding {
  const binding: DeviceBinding = {
    locationId: location.id,
    locationName: location.name,
    locationCode: location.code,
    boundAt: new Date().toISOString(),
    boundBy,
    registrationCodeRef: metadata?.registrationCodeRef,
    deviceId: metadata?.deviceId,
  };
  setJSON(storage, KEY, binding);
  return binding;
}

/**
 * Bind this device to a store location.
 * Only a manager/admin should call this (enforced at UI level).
 */
export function setDeviceBinding(binding: DeviceBinding): void {
  setJSON(storage, KEY, binding);
}

/**
 * Clear the device binding.
 * Kept for admin/decommission tooling only. Do not expose from Android POS UI.
 */
export function clearDeviceBinding(): void {
  storage.delete(KEY);
}

/**
 * Check if the device has been bound to a store.
 */
export function isDeviceBound(): boolean {
  return getDeviceBinding() !== null;
}
