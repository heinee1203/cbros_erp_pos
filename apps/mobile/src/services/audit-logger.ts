import { storage, getJSON, setJSON } from '@/storage/mmkv';

const AUDIT_KEY = 'pos_audit_log';
const MAX_ENTRIES = 200;

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;           // 'price_override' | 'void_sale' | 'manual_discount' | 'refund'
  description: string;      // Human-readable: "Price override on Brake Pad P500 -> P400"
  approvedBy: string;       // Manager/admin who approved
  performedBy: string;      // Cashier who requested
  metadata?: Record<string, any>;
}

export function logElevation(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  const entries = getJSON<AuditEntry[]>(storage, AUDIT_KEY) ?? [];
  const newEntry: AuditEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
  };
  entries.unshift(newEntry);
  // Keep only last MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  setJSON(storage, AUDIT_KEY, entries);
}

export function getAuditLog(): AuditEntry[] {
  return getJSON<AuditEntry[]>(storage, AUDIT_KEY) ?? [];
}

export function clearAuditLog(): void {
  setJSON(storage, AUDIT_KEY, []);
}
