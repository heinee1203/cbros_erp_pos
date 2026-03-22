import { syncCatalog, type SyncProgress } from './catalog-sync';
import { syncInventory } from './inventory-sync';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export interface SyncStatus {
  isSyncing: boolean;
  lastCatalogSync: string | null;
  lastInventorySync: string | null;
  error: string | null;
  /** Live progress during sync */
  progress: SyncProgress | null;
}

let _isSyncing = false;
let _listeners: Array<(status: SyncStatus) => void> = [];
let _currentProgress: SyncProgress | null = null;

function getStatus(): SyncStatus {
  return {
    isSyncing: _isSyncing,
    lastCatalogSync: storage.getString(KEYS.LAST_CATALOG_SYNC) ?? null,
    lastInventorySync: storage.getString(KEYS.LAST_INVENTORY_SYNC) ?? null,
    error: null,
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

  _isSyncing = true;
  _currentProgress = null;
  notify(getStatus());

  const handleProgress = (progress: SyncProgress) => {
    _currentProgress = progress;
    notify({ ...getStatus(), progress });
  };

  try {
    await syncCatalog(handleProgress);
    await syncInventory(handleProgress);

    _currentProgress = null;
    const status = getStatus();
    _isSyncing = false;
    notify(status);
    return status;
  } catch (error: any) {
    _isSyncing = false;
    _currentProgress = null;
    const status = { ...getStatus(), error: error.message };
    notify(status);
    return status;
  }
}

export { getStatus as getSyncStatus };
