import { KEYS } from '@/storage/keys';
import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { recordSupportLog } from '@/storage/support-logs';

export interface SessionRecoveryIntent {
  reason: string;
  method?: string;
  path?: string;
  screenHint?: string;
  createdAt: string;
}

type Listener = (intent: SessionRecoveryIntent | null) => void;

const listeners = new Set<Listener>();

function notify() {
  const intent = getSessionRecoveryIntent();
  listeners.forEach(listener => listener(intent));
}

export function getSessionRecoveryIntent(): SessionRecoveryIntent | null {
  return getJSON<SessionRecoveryIntent>(storage, KEYS.SESSION_RECOVERY_INTENT);
}

export function recordSessionRecoveryIntent(input: Omit<SessionRecoveryIntent, 'createdAt'>): void {
  const intent: SessionRecoveryIntent = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  setJSON(storage, KEYS.SESSION_RECOVERY_INTENT, intent);
  recordSupportLog({
    category: 'auth',
    level: 'warning',
    message: input.reason,
    context: {
      method: input.method,
      path: input.path,
      screenHint: input.screenHint,
    },
  });
  notify();
}

export function clearSessionRecoveryIntent(): void {
  storage.delete(KEYS.SESSION_RECOVERY_INTENT);
  notify();
}

export function subscribeSessionRecoveryIntent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
