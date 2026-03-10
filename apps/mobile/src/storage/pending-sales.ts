import { storage, getJSON, setJSON } from './mmkv';
import { KEYS } from './keys';

export interface PendingSale {
  idempotencyKey: string;
  /** Null when sale was never created on the server (fully offline) */
  saleId: string | null;
  /** Payload for completing an already-created sale */
  payload: {
    idempotencyKey: string;
    payments: Array<{
      method: string;
      amount: string;
      reference?: string;
    }>;
  };
  /** Full creation payload — present when sale was never sent to server */
  createPayload?: {
    locationId: string;
    customerId?: string;
    customerVehicleId?: string;
    notes?: string;
    lines: Array<{
      productId: string;
      quantity: number;
      discountAmount?: string;
    }>;
  };
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: 'pending' | 'reconciling' | 'failed';
}

export function getPendingSales(): PendingSale[] {
  return getJSON<PendingSale[]>(storage, KEYS.PENDING_SALES) ?? [];
}

export function addPendingSale(sale: PendingSale): void {
  const current = getPendingSales();
  current.push(sale);
  setJSON(storage, KEYS.PENDING_SALES, current);
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
  }
}

export function removePendingSale(idempotencyKey: string): void {
  const current = getPendingSales().filter(
    s => s.idempotencyKey !== idempotencyKey,
  );
  setJSON(storage, KEYS.PENDING_SALES, current);
}
