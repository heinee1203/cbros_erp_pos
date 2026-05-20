import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export const PROTECTED_ACTION_FRESH_MS = 5 * 60 * 1000;

export interface ProtectedActionSession {
  authorizedAt: string;
  approverName: string;
  method: 'pin' | 'barcode' | 'card';
  action?: string;
  userId?: string;
  role?: string;
}

export function getProtectedActionSession(): ProtectedActionSession | null {
  return getJSON<ProtectedActionSession>(storage, KEYS.PROTECTED_ACTION_LAST_AUTH);
}

export function recordProtectedActionAuth(input: Omit<ProtectedActionSession, 'authorizedAt'>): void {
  setJSON(storage, KEYS.PROTECTED_ACTION_LAST_AUTH, {
    ...input,
    authorizedAt: new Date().toISOString(),
  });
}

export function isProtectedActionFresh(now = Date.now()): boolean {
  const session = getProtectedActionSession();
  if (!session) return false;

  const authorizedAt = new Date(session.authorizedAt).getTime();
  if (!Number.isFinite(authorizedAt)) return false;
  return now - authorizedAt <= PROTECTED_ACTION_FRESH_MS;
}

export function getProtectedActionFreshnessLabel(): string {
  const session = getProtectedActionSession();
  if (!session) return 'Manager approval required';

  const authorizedAt = new Date(session.authorizedAt).getTime();
  if (!Number.isFinite(authorizedAt)) return 'Manager approval required';

  const remainingMs = PROTECTED_ACTION_FRESH_MS - (Date.now() - authorizedAt);
  if (remainingMs <= 0) return 'Manager re-authorization required';

  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `Fresh approval: ${minutes}m remaining`;
}
