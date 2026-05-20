import { KEYS } from '@/storage/keys';
import { getJSON, setJSON, storage } from '@/storage/mmkv';

const MAX_SUPPORT_LOGS = 160;

export type SupportLogCategory =
  | 'api'
  | 'auth'
  | 'checkout'
  | 'device'
  | 'drawer'
  | 'hardware'
  | 'inventory'
  | 'print'
  | 'scanner'
  | 'sync';

export type SupportLogLevel = 'info' | 'warning' | 'error';

export interface SupportLogEntry {
  id: string;
  category: SupportLogCategory;
  level: SupportLogLevel;
  message: string;
  detail?: string;
  context?: Record<string, string | number | boolean | null | undefined>;
  createdAt: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(listener => listener());
}

function makeId() {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function redactSupportText(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/("?(?:password|pin|token|authorization|managerCredential|registrationCode)"?\s*[:=]\s*)"?[^",}\s]+/gi, '$1[REDACTED]')
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '[REDACTED_CARD]')
    .replace(/\b[A-Z0-9]{12,}\b/g, '[REDACTED_CODE]');
}

export function getSupportLogs(): SupportLogEntry[] {
  return getJSON<SupportLogEntry[]>(storage, KEYS.SUPPORT_LOGS) ?? [];
}

export function setSupportLogs(entries: SupportLogEntry[]) {
  setJSON(storage, KEYS.SUPPORT_LOGS, entries.slice(0, MAX_SUPPORT_LOGS));
  notify();
}

export function recordSupportLog(input: {
  category: SupportLogCategory;
  level: SupportLogLevel;
  message: string;
  detail?: unknown;
  context?: SupportLogEntry['context'];
}) {
  const entry: SupportLogEntry = {
    id: makeId(),
    category: input.category,
    level: input.level,
    message: redactSupportText(input.message),
    detail: input.detail == null ? undefined : redactSupportText(input.detail),
    context: input.context,
    createdAt: new Date().toISOString(),
  };

  setSupportLogs([entry, ...getSupportLogs()].slice(0, MAX_SUPPORT_LOGS));
  return entry;
}

export function subscribeSupportLogs(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function buildSupportLogText(limit = 40): string {
  const logs = getSupportLogs().slice(0, limit);
  if (logs.length === 0) return 'No support logs recorded on this device.';

  return logs
    .map(log => {
      const at = new Date(log.createdAt).toLocaleString('en-PH');
      const detail = log.detail ? ` - ${log.detail}` : '';
      return `${at} [${log.level.toUpperCase()}] ${log.category}: ${log.message}${detail}`;
    })
    .join('\n');
}
