import { storage, getJSON, setJSON } from '@/storage/mmkv';
import { apiFetch } from './api-client';

const KEY = 'pos_elevation_logs';

export interface ElevationLogEntry {
  timestamp: string;
  action: string;              // "discount_15", "price_override", "refund"
  requestedBy: string;         // cashier user ID
  requestedByName: string;
  approvedBy: string;          // manager user name (from PIN verification)
  details: string;             // "10% discount on MOTOLITE ENDURO"
  saleId?: string;
}

/**
 * Log a permission elevation event.
 * Stored locally in MMKV and synced to server on next opportunity.
 */
export function logElevation(entry: ElevationLogEntry): void {
  const current = getJSON<ElevationLogEntry[]>(storage, KEY) ?? [];
  current.push(entry);
  setJSON(storage, KEY, current);
}

/**
 * Get all pending (not yet synced) elevation logs.
 */
export function getPendingElevationLogs(): ElevationLogEntry[] {
  return getJSON<ElevationLogEntry[]>(storage, KEY) ?? [];
}

/**
 * Sync elevation logs to the server.
 * Call periodically or after sale completion.
 */
export async function syncElevationLogs(): Promise<void> {
  const logs = getPendingElevationLogs();
  if (logs.length === 0) return;

  try {
    await apiFetch('/pos/elevation-logs', {
      method: 'POST',
      requireLockedLocation: true,
      body: JSON.stringify({ logs }),
    });
    // Clear synced logs
    storage.delete(KEY);
  } catch {
    // Will retry on next sync opportunity
  }
}
