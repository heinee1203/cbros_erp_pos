import { secureStorage, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getLockedLocationId, requireLockedLocationId } from '@/config/device-binding';
import { isDeviceDisabled, setDisabledDeviceState } from '@/storage/device-status';
import { recordSupportLog } from '@/storage/support-logs';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getBaseUrl(): string {
  return storage.getString(KEYS.API_BASE_URL) || 'http://10.0.2.2:3000';
  // 10.0.2.2 = host machine from Android emulator
}

function getToken(): string | null {
  return secureStorage.getString(KEYS.AUTH_TOKEN)
    ?? storage.getString(KEYS.AUTH_TOKEN)
    ?? null;
}

function getLocationId(): string | null {
  const lockedLocationId = getLockedLocationId();
  if (lockedLocationId) return lockedLocationId;

  try {
    const bindingRaw = storage.getString('device_binding');
    if (bindingRaw) {
      const binding = JSON.parse(bindingRaw);
      return binding.locationId ?? null;
    }
  } catch {}

  return storage.getString(KEYS.AUTH_LOCATION_ID) ?? null;
}

function canRunWhileDeviceBlocked(path: string) {
  return path.startsWith('/devices/check')
    || path.startsWith('/auth/')
    || path.startsWith('/health');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; requireLockedLocation?: boolean } = {},
): Promise<T> {
  const { skipAuth, requireLockedLocation, headers: customHeaders, ...rest } = options;
  const method = rest.method || 'GET';

  if (!skipAuth && isDeviceDisabled() && !canRunWhileDeviceBlocked(path)) {
    recordSupportLog({
      category: 'device',
      level: 'error',
      message: 'Blocked API call because device is disabled',
      context: { method, path },
    });
    throw new ApiError('This device has been disabled. Contact support.', 403, {
      code: 'DEVICE_DEACTIVATED',
    });
  }

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string> || {}),
  };

  if (rest.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (__DEV__) {
      console.warn(`[apiFetch] No auth token for ${method} ${path}`);
    }

    const locationId = requireLockedLocation
      ? requireLockedLocationId(`${method} ${path}`)
      : getLocationId();
    if (locationId) headers['X-Location-ID'] = locationId;
  }

  const url = `${getBaseUrl()}${path}`;

  if (__DEV__) {
    console.log(`[apiFetch] ${method} ${url}`, {
      hasAuth: !!headers['Authorization'],
      hasLocation: !!headers['X-Location-ID'],
      skipAuth: !!skipAuth,
    });
  }

  let res: Response;
  try {
    res = await fetch(url, { headers, ...rest });
  } catch (err) {
    if (__DEV__) console.error(`[apiFetch] Network error for ${url}:`, err);
    recordSupportLog({
      category: 'api',
      level: 'error',
      message: 'Network error',
      detail: err instanceof Error ? err.message : String(err),
      context: { method, path },
    });
    throw new ApiError('Network error — check connection', 0);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      recordSupportLog({
        category: 'auth',
        level: 'warning',
        message: 'API token expired or unauthorized',
        context: { method, path },
      });
    } else if (res.status === 403 && (body.code === 'DEVICE_DEACTIVATED' || body.code === 'DEVICE_LOCATION_INACTIVE')) {
      const device = body.device as Record<string, unknown> | undefined;
      setDisabledDeviceState({
        disabled: true,
        code: typeof body.code === 'string' ? body.code : 'DEVICE_BLOCKED',
        reason: typeof body.error === 'string' ? body.error : 'Device blocked by backend',
        deviceId: typeof device?.deviceId === 'string' ? device.deviceId : undefined,
        locationId: typeof device?.locationId === 'string' ? device.locationId : undefined,
        locationName: typeof device?.locationName === 'string' ? device.locationName : undefined,
        locationCode: typeof device?.locationCode === 'string' ? device.locationCode : undefined,
        checkedAt: new Date().toISOString(),
      });
    } else {
      recordSupportLog({
        category: 'api',
        level: res.status >= 500 ? 'error' : 'warning',
        message: `API error ${res.status}`,
        detail: body,
        context: { method, path },
      });
    }
    // Fastify @sensible puts detail in `message`, status text in `error`
    throw new ApiError(
      body.message || body.error || `API error: ${res.status}`,
      res.status,
      body,
    );
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}
