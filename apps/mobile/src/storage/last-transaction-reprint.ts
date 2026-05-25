import type { ReceiptData } from '@/hardware/printer/types';
import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export interface LastTransactionReprint {
  saleId?: string;
  saleNo?: string;
  receiptNumber: string;
  receipt: ReceiptData;
  storedAt: string;
}

export function getLastTransactionReprint(): LastTransactionReprint | null {
  return getJSON<LastTransactionReprint>(storage, KEYS.LAST_TRANSACTION_REPRINT) ?? null;
}

export function recordLastTransactionReprint(input: Omit<LastTransactionReprint, 'storedAt'>): void {
  setJSON(storage, KEYS.LAST_TRANSACTION_REPRINT, {
    ...input,
    storedAt: new Date().toISOString(),
  });
}
