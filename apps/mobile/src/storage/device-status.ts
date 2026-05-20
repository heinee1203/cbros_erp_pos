import { KEYS } from '@/storage/keys';
import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { recordSupportLog } from '@/storage/support-logs';

export interface DisabledDeviceState {
  disabled: boolean;
  code?: string;
  reason?: string;
  deviceId?: string;
  locationId?: string;
  locationName?: string;
  locationCode?: string;
  checkedAt: string;
}

export function getDisabledDeviceState(): DisabledDeviceState | null {
  return getJSON<DisabledDeviceState>(storage, KEYS.DISABLED_DEVICE_STATE);
}

export function isDeviceDisabled(): boolean {
  return getDisabledDeviceState()?.disabled === true;
}

export function setDisabledDeviceState(state: DisabledDeviceState | null) {
  if (!state) {
    storage.delete(KEYS.DISABLED_DEVICE_STATE);
    return;
  }
  setJSON(storage, KEYS.DISABLED_DEVICE_STATE, state);
  if (state.disabled) {
    recordSupportLog({
      category: 'device',
      level: 'error',
      message: state.reason || 'Device disabled by backend',
      context: {
        code: state.code,
        locationCode: state.locationCode,
      },
    });
  }
}
