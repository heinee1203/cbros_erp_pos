import { bindDeviceToLocation, type DeviceBinding } from '@/config/device-binding';
import { APP_VERSION } from '@/config/app-version';
import { apiFetch, ApiError } from '@/services/api-client';
import { setDisabledDeviceState } from '@/storage/device-status';
import { setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { recordSupportLog } from '@/storage/support-logs';
import { getOrCreateDeviceId } from '@/utils/register-health';

interface RegisteredDevicePayload {
  device: {
    id: string;
    name: string;
    locationId: string;
    locationName: string;
    locationCode?: string;
    registrationCodeRef?: string | null;
    status?: string;
  };
}

interface DeviceCheckPayload {
  registered: boolean;
  device?: {
    id: string;
    name: string;
    locationId: string;
    locationName: string;
    locationCode?: string;
    status?: string;
  };
}

export async function registerDeviceWithCode(input: {
  registrationCode: string;
  name?: string;
  operator: string;
}): Promise<DeviceBinding> {
  const deviceId = getOrCreateDeviceId();
  const response = await apiFetch<RegisteredDevicePayload>('/devices/register', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      name: input.name || `APEX POS ${deviceId.slice(-6).toUpperCase()}`,
      registrationCode: input.registrationCode.trim(),
      appVersion: APP_VERSION,
    }),
  });

  const binding = bindDeviceToLocation(
    {
      id: response.device.locationId,
      name: response.device.locationName,
      code: response.device.locationCode || '',
    },
    input.operator,
    {
      registrationCodeRef: response.device.registrationCodeRef ?? undefined,
      deviceId,
    },
  );

  setJSON(storage, KEYS.REGISTRATION_METADATA, {
    deviceId,
    registrationCodeRef: response.device.registrationCodeRef ?? null,
    registeredAt: binding.boundAt,
    registeredBy: input.operator,
  });
  setDisabledDeviceState(null);
  recordSupportLog({
    category: 'device',
    level: 'info',
    message: 'Device registered to store',
    context: {
      locationCode: binding.locationCode,
      locationId: binding.locationId,
    },
  });

  return binding;
}

export async function checkDeviceStatus(): Promise<DeviceCheckPayload> {
  try {
    const response = await apiFetch<DeviceCheckPayload>('/devices/check', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getOrCreateDeviceId(),
        appVersion: APP_VERSION,
      }),
    });
    setDisabledDeviceState(null);
    return response;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      throw err;
    }
    recordSupportLog({
      category: 'device',
      level: 'warning',
      message: 'Device status check failed',
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
