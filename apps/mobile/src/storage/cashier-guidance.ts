import { KEYS } from '@/storage/keys';
import { storage } from '@/storage/mmkv';

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();

export function isGuidedCashierModeEnabled(): boolean {
  return storage.getBoolean(KEYS.GUIDED_CASHIER_MODE) === true;
}

export function setGuidedCashierMode(enabled: boolean): void {
  storage.set(KEYS.GUIDED_CASHIER_MODE, enabled);
  listeners.forEach(listener => listener(enabled));
}

export function subscribeGuidedCashierMode(listener: Listener): () => void {
  listeners.add(listener);
  listener(isGuidedCashierModeEnabled());
  return () => {
    listeners.delete(listener);
  };
}
