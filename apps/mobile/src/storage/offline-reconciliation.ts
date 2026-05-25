import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export type OfflineRecordType = 'pending-sale' | 'drawer-event';
export type OfflineLifecycleStatus =
  | 'queued'
  | 'retrying'
  | 'accepted'
  | 'duplicate'
  | 'blocked'
  | 'manager_reviewed'
  | 'support_needed';

export interface OfflineReconciliationOutcome {
  id: string;
  type: OfflineRecordType;
  status: OfflineLifecycleStatus;
  serverId?: string | null;
  message?: string;
  updatedAt: string;
  nextRetryAt?: string | null;
  reviewedBy?: string;
  reviewedAt?: string;
}

type Listener = (outcomes: Record<string, OfflineReconciliationOutcome>) => void;
let listeners: Listener[] = [];

function key(type: OfflineRecordType, id: string): string {
  return `${type}:${id}`;
}

function notify() {
  const outcomes = getOfflineReconciliationOutcomes();
  listeners.forEach(listener => listener(outcomes));
}

export function getOfflineReconciliationOutcomes(): Record<string, OfflineReconciliationOutcome> {
  return getJSON<Record<string, OfflineReconciliationOutcome>>(storage, KEYS.OFFLINE_RECONCILIATION_OUTCOMES) ?? {};
}

export function getOfflineReconciliationOutcome(
  type: OfflineRecordType,
  id: string,
): OfflineReconciliationOutcome | null {
  return getOfflineReconciliationOutcomes()[key(type, id)] ?? null;
}

export function recordOfflineReconciliationOutcome(input: Omit<OfflineReconciliationOutcome, 'updatedAt'>): void {
  const outcomes = getOfflineReconciliationOutcomes();
  outcomes[key(input.type, input.id)] = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
  setJSON(storage, KEYS.OFFLINE_RECONCILIATION_OUTCOMES, outcomes);
  notify();
}

export function subscribeOfflineReconciliationOutcomes(listener: Listener): () => void {
  listeners.push(listener);
  listener(getOfflineReconciliationOutcomes());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
}
