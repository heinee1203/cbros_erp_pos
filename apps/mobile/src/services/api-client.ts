import { secureStorage, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getLockedLocationId, requireLockedLocationId } from '@/config/device-binding';

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

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; requireLockedLocation?: boolean } = {},
): Promise<T> {
  const { skipAuth, requireLockedLocation, headers: customHeaders, ...rest } = options;

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
      console.warn(`[apiFetch] No auth token for ${rest.method || 'GET'} ${path}`);
    }

    const locationId = requireLockedLocation
      ? requireLockedLocationId(`${rest.method || 'GET'} ${path}`)
      : getLocationId();
    if (locationId) headers['X-Location-ID'] = locationId;
  }

  const url = `${getBaseUrl()}${path}`;

  if (__DEV__) {
    console.log(`[apiFetch] ${rest.method || 'GET'} ${url}`, {
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
    throw new ApiError('Network error — check connection', 0);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
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
