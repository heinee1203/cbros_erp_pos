import { secureStorage, storage, setJSON, getJSON } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getLockedLocationId } from '@/config/device-binding';
import { apiFetch } from './api-client';

export interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAREHOUSE_STAFF';
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface LocationInfo {
  id: string;
  name: string;
  code: string;
  type: string;
  address?: string | null;
  isActive: boolean;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
  // Persist
  secureStorage.set(KEYS.AUTH_TOKEN, result.token);
  storage.set(KEYS.AUTH_TOKEN, result.token);
  setJSON(secureStorage, KEYS.AUTH_USER, result.user);
  setJSON(storage, KEYS.AUTH_USER, result.user);
  return result;
}

export function logout(): void {
  secureStorage.delete(KEYS.AUTH_TOKEN);
  secureStorage.delete(KEYS.AUTH_USER);
  storage.delete(KEYS.AUTH_TOKEN);
  storage.delete(KEYS.AUTH_USER);
  storage.delete(KEYS.AUTH_LOCATION_ID);
  storage.delete(KEYS.AUTH_LOCATIONS);
}

export function getStoredUser(): UserInfo | null {
  return getJSON<UserInfo>(secureStorage, KEYS.AUTH_USER)
    ?? getJSON<UserInfo>(storage, KEYS.AUTH_USER);
}

export function getStoredToken(): string | null {
  return secureStorage.getString(KEYS.AUTH_TOKEN)
    ?? storage.getString(KEYS.AUTH_TOKEN)
    ?? null;
}

export function setActiveLocation(locationId: string): void {
  const lockedLocationId = getLockedLocationId();
  storage.set(KEYS.AUTH_LOCATION_ID, lockedLocationId ?? locationId);
}

export function clearActiveLocation(): void {
  storage.delete(KEYS.AUTH_LOCATION_ID);
}

export function getActiveLocation(): string | null {
  const lockedLocationId = getLockedLocationId();
  if (lockedLocationId) {
    storage.set(KEYS.AUTH_LOCATION_ID, lockedLocationId);
    return lockedLocationId;
  }

  return storage.getString(KEYS.AUTH_LOCATION_ID) ?? null;
}

export function getStoredLocations(): LocationInfo[] {
  return getJSON<LocationInfo[]>(storage, KEYS.AUTH_LOCATIONS) ?? [];
}

export function setStoredLocations(locations: LocationInfo[]): void {
  setJSON(storage, KEYS.AUTH_LOCATIONS, locations);
}

export async function fetchLocations(): Promise<LocationInfo[]> {
  const result = await apiFetch<{ data: LocationInfo[] }>('/locations');
  setStoredLocations(result.data);
  return result.data;
}

/**
 * Decode a base64url string (JWT segments use base64url, not standard base64).
 * Handles missing padding and url-safe characters (`-` → `+`, `_` → `/`).
 * Works on Hermes and all RN JS engines without relying on `atob`.
 */
function decodeBase64Url(str: string): string {
  // Replace url-safe chars with standard base64 chars
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  // Hermes supports atob for standard base64
  try {
    return atob(base64);
  } catch {
    // Fallback: manual decode for environments without atob
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let bits = 0;
    let collected = 0;
    for (let i = 0; i < base64.length; i++) {
      const idx = chars.indexOf(base64[i]);
      if (idx < 0) continue; // skip padding / invalid chars
      bits = (bits << 6) | idx;
      collected += 6;
      if (collected >= 8) {
        collected -= 8;
        result += String.fromCharCode((bits >> collected) & 0xff);
      }
    }
    return result;
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
