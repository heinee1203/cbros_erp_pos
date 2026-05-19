import { syncCatalog, type SyncProgress } from './catalog-sync';
import { syncInventory } from './inventory-sync';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getLockedLocationId } from '@/config/device-binding';

export interface SyncStatus {
  isSyncing: boolean;
  lastCatalogSync: string | null;
  lastInventorySync: string | null;
  error: string | null;
  lastAttemptStartedAt: string | null;
  lastAttemptFinishedAt: string | null;
  /** Live progress during sync */
  progress: SyncProgress | null;
}

let _isSyncing = false;
let _listeners: Array<(status: SyncStatus) => void> = [];
let _currentProgress: SyncProgress | null = null;
let _lastError: string | null = null;
let _lastAttemptStartedAt: string | null = null;
let _lastAttemptFinishedAt: string | null = null;

function getStatus(): SyncStatus {
  return {
    isSyncing: _isSyncing,
    lastCatalogSync: storage.getString(KEYS.LAST_CATALOG_SYNC) ?? null,
    lastInventorySync: storage.getString(KEYS.LAST_INVENTORY_SYNC) ?? null,
    error: _lastError,
    lastAttemptStartedAt: _lastAttemptStartedAt,
    lastAttemptFinishedAt: _lastAttemptFinishedAt,
    progress: _currentProgress,
  };
}

function notify(status: SyncStatus) {
  _listeners.forEach(fn => fn(status));
}

export function onSyncStatus(listener: (status: SyncStatus) => void): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter(fn => fn !== listener);
  };
}

export async function runFullSync(): Promise<SyncStatus> {
  if (_isSyncing) return getStatus();

  if (!getLockedLocationId()) {
    const now = new Date().toISOString();
    _lastError = 'Register this device to a store before syncing POS data.';
    _lastAttemptStartedAt = now;
    _lastAttemptFinishedAt = now;
    const status = getStatus();
    notify(status);
    return status;
  }

  _isSyncing = true;
  _currentProgress = null;
  _lastError = null;
  _lastAttemptStartedAt = new Date().toISOString();
  _lastAttemptFinishedAt = null;
  notify(getStatus());

  const handleProgress = (progress: SyncProgress) => {
    _currentProgress = progress;
    notify({ ...getStatus(), progress });
  };

  try {
    await syncCatalog(handleProgress);
    await syncInventory(handleProgress);

    _currentProgress = null;
    _isSyncing = false;
    _lastError = null;
    _lastAttemptFinishedAt = new Date().toISOString();
    const status = getStatus();
    notify(status);
    return status;
  } catch (error: any) {
    _isSyncing = false;
    _currentProgress = null;
    _lastError = error?.message || 'Sync failed. Check the server connection and try again.';
    _lastAttemptFinishedAt = new Date().toISOString();
    const status = getStatus();
    notify(status);
    return status;
  }
}

export { getStatus as getSyncStatus };
