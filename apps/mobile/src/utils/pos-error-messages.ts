import { ApiError } from '@/services/api-client';

const STORE_LOCK_PATTERNS = [
  'locked to a store',
  'locked to an active store',
  'register this device to a store',
  'requires this register',
  'before syncing pos data',
];

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const anyError = error as { message?: unknown; error?: unknown };
    if (typeof anyError.message === 'string') return anyError.message;
    if (typeof anyError.error === 'string') return anyError.error;
  }
  return '';
}

export function isStoreLockError(error: unknown): boolean {
  const message = rawMessage(error).toLowerCase();
  return STORE_LOCK_PATTERNS.some(pattern => message.includes(pattern));
}

export function formatPosError(error: unknown, fallback = 'Action failed. Try again or contact support.'): string {
  const message = rawMessage(error).trim();

  if (isStoreLockError(error)) {
    return 'This register is not locked to an active store. Register or repair the device assignment from ERP before continuing.';
  }

  if (error instanceof ApiError) {
    if (error.status === 0) {
      return 'Server is not reachable. Check the network or keep working offline where the POS allows it.';
    }
    if (error.status === 401) {
      return 'Session expired. Sign in again before continuing.';
    }
    if (error.status === 403) {
      return 'Your account is not authorized for this action. Ask a manager to approve or use an authorized account.';
    }
  }

  if (message.toLowerCase().includes('network error')) {
    return 'Server is not reachable. Check the network or keep working offline where the POS allows it.';
  }

  return message || fallback;
}
