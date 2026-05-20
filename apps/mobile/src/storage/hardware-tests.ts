import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getDeviceBinding } from '@/config/device-binding';
import { APP_BUILD_DATE, APP_VERSION } from '@/config/app-version';
import { recordSupportLog } from '@/storage/support-logs';

export type HardwareTestType =
  | 'receipt-printer'
  | 'label-printer'
  | 'scanner'
  | 'manager-authorization'
  | 'cash-drawer';

export type HardwareTestStatus = 'pass' | 'fail';

export interface HardwareTestResult {
  id: string;
  type: HardwareTestType;
  title: string;
  status: HardwareTestStatus;
  operator?: string;
  note?: string;
  error?: string;
  store?: string;
  storeCode?: string;
  deviceId?: string;
  appBuild?: string;
  hardwareType?: string;
  createdAt: string;
}

type HardwareTestListener = (results: HardwareTestResult[]) => void;

const MAX_HARDWARE_TEST_RESULTS = 60;
let listeners: HardwareTestListener[] = [];

function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function getStoredDeviceId(): string {
  const existing = storage.getString(KEYS.DEVICE_ID);
  if (existing) return existing;
  const next = `apex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  storage.set(KEYS.DEVICE_ID, next);
  return next;
}

function notify(): void {
  const results = getHardwareTestResults();
  listeners.forEach(listener => listener(results));
}

export function getHardwareTestResults(): HardwareTestResult[] {
  return getJSON<HardwareTestResult[]>(storage, KEYS.HARDWARE_TEST_RESULTS) ?? [];
}

export function getLastHardwareTestResult(type: HardwareTestType): HardwareTestResult | null {
  return getHardwareTestResults().find(result => result.type === type) ?? null;
}

export function recordHardwareTestResult(input: {
  type: HardwareTestType;
  title: string;
  status: HardwareTestStatus;
  operator?: string;
  note?: string;
  error?: string;
}): HardwareTestResult {
  const result: HardwareTestResult = {
    ...(() => {
      const binding = getDeviceBinding();
      return {
        store: binding?.locationName,
        storeCode: binding?.locationCode,
      };
    })(),
    id: createId(),
    type: input.type,
    title: input.title,
    status: input.status,
    operator: input.operator,
    note: input.note,
    error: input.error,
    deviceId: getStoredDeviceId(),
    appBuild: `${APP_VERSION} (${APP_BUILD_DATE})`,
    hardwareType: input.type,
    createdAt: new Date().toISOString(),
  };

  setJSON(storage, KEYS.HARDWARE_TEST_RESULTS, [
    result,
    ...getHardwareTestResults(),
  ].slice(0, MAX_HARDWARE_TEST_RESULTS));
  recordSupportLog({
    category: 'hardware',
    level: input.status === 'pass' ? 'info' : 'error',
    message: `${input.title} ${input.status}`,
    detail: input.error || input.note,
    context: { hardwareType: input.type },
  });
  notify();
  return result;
}

export function onHardwareTestResultsChanged(listener: HardwareTestListener): () => void {
  listeners.push(listener);
  listener(getHardwareTestResults());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
}

export function buildHardwareTestSummaryText(results = getHardwareTestResults()): string {
  if (results.length === 0) return 'No hardware certifications recorded on this tablet.';

  return results.slice(0, 8).map(result => {
    const note = result.error || result.note || 'No note';
    return [
      `${result.status.toUpperCase()}: ${result.title}`,
      note,
      result.operator ? `by ${result.operator}` : 'operator unknown',
      result.storeCode ? `store ${result.storeCode}` : 'store unknown',
      result.appBuild || 'build unknown',
      new Date(result.createdAt).toLocaleString('en-PH'),
    ].join(' / ');
  }).join('\n');
}
