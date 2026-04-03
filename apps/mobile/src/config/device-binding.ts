import { storage, getJSON, setJSON } from '@/storage/mmkv';

const KEY = 'device_binding';

export interface DeviceBinding {
  locationId: string;
  locationName: string;
  locationCode: string;
  boundAt: string;      // ISO timestamp
  boundBy: string;      // manager name who set it up
}

/**
 * Get the current device store binding.
 * Returns null if device hasn't been bound to a store yet.
 */
export function getDeviceBinding(): DeviceBinding | null {
  return getJSON<DeviceBinding>(storage, KEY) ?? null;
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
 * Used when re-binding to a different store.
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
