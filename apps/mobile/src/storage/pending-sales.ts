import { storage, getJSON, setJSON } from './mmkv';
import { KEYS } from './keys';

export interface PendingSale {
  idempotencyKey: string;
  /** Null when sale was never created on the server (fully offline) */
  saleId: string | null;
  /** Payload for completing an already-created sale */
  payload: {
    idempotencyKey: string;
    allowNegativeStock?: boolean;
    overrideApproval?: {
      pin?: string;
      credential?: string;
      method?: 'pin' | 'barcode' | 'card';
    };
    payments: Array<{
      method: string;
      amount: string;
      reference?: string;
      notes?: string;
    }>;
  };
  /** Full creation payload — present when sale was never sent to server */
  createPayload?: {
    locationId: string;
    customerId?: string;
    customerVehicleId?: string;
    receiptNumber?: string;
    notes?: string;
    lines: Array<{
      productId: string;
      quantity: number;
      overridePrice?: string;
      discountAmount?: string;
      serials?: string[];
      dotAllocation?: Array<{
        dotBatchId: string;
        dotCode: string;
        quantity: number;
      }>;
      technicianId?: string;
    }>;
  };
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: 'pending' | 'reconciling' | 'failed';
  lifecycleStatus?: 'queued' | 'retrying' | 'accepted' | 'duplicate' | 'blocked' | 'manager_reviewed' | 'support_needed';
  nextRetryAt?: string | null;
  serverOutcome?: string;
  managerReviewedAt?: string;
  managerReviewedBy?: string;
  failureReason?: string;
}

type PendingSalesListener = (sales: PendingSale[]) => void;

let listeners: PendingSalesListener[] = [];

function notifyPendingSalesChanged(): void {
  const next = getPendingSales();
  listeners.forEach(listener => listener(next));
}

export function onPendingSalesChanged(listener: PendingSalesListener): () => void {
  listeners.push(listener);
  listener(getPendingSales());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
}

export function getPendingSales(): PendingSale[] {
  return getJSON<PendingSale[]>(storage, KEYS.PENDING_SALES) ?? [];
}

export function addPendingSale(sale: PendingSale): void {
  const current = getPendingSales();
  const idx = current.findIndex(s => s.idempotencyKey === sale.idempotencyKey);
  if (idx >= 0) {
    current[idx] = {
      ...current[idx],
      ...sale,
      lifecycleStatus: sale.lifecycleStatus ?? current[idx].lifecycleStatus ?? 'queued',
      createdAt: current[idx].createdAt,
      attempts: current[idx].attempts,
      lastAttemptAt: current[idx].lastAttemptAt,
    };
  } else {
    current.push({ ...sale, lifecycleStatus: sale.lifecycleStatus ?? 'queued' });
  }
  setJSON(storage, KEYS.PENDING_SALES, current);
  notifyPendingSalesChanged();
}

export function markPendingSaleLifecycle(
  idempotencyKey: string,
  lifecycleStatus: NonNullable<PendingSale['lifecycleStatus']>,
  extra: Partial<PendingSale> = {},
): void {
  updatePendingSale(idempotencyKey, {
    ...extra,
    lifecycleStatus,
  });
}

export function updatePendingSale(
  idempotencyKey: string,
  updates: Partial<PendingSale>,
): void {
  const current = getPendingSales();
  const idx = current.findIndex(s => s.idempotencyKey === idempotencyKey);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...updates };
    setJSON(storage, KEYS.PENDING_SALES, current);
    notifyPendingSalesChanged();
  }
}

export function removePendingSale(idempotencyKey: string): void {
  const current = getPendingSales().filter(
    s => s.idempotencyKey !== idempotencyKey,
  );
  setJSON(storage, KEYS.PENDING_SALES, current);
  notifyPendingSalesChanged();
}
