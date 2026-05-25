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
  readinessState?: 'ready' | 'warning' | 'blocked';
  freshness?: 'fresh' | 'stale';
  createdAt: string;
}

export interface HardwareCertificationSummary {
  state: 'ready' | 'warning' | 'blocked';
  readyCount: number;
  warningCount: number;
  blockedCount: number;
  totalRequired: number;
  detail: string;
}

type HardwareTestListener = (results: HardwareTestResult[]) => void;

const MAX_HARDWARE_TEST_RESULTS = 60;
const CERTIFICATION_FRESH_DAYS = 30;
const REQUIRED_CERTIFICATIONS: HardwareTestType[] = [
  'receipt-printer',
  'label-printer',
  'scanner',
  'manager-authorization',
  'cash-drawer',
];
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

function isFresh(result: HardwareTestResult | null): boolean {
  if (!result) return false;
  const createdAt = Date.parse(result.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt <= CERTIFICATION_FRESH_DAYS * 86_400_000;
}

function resultReadiness(result: HardwareTestResult | null): 'ready' | 'warning' | 'blocked' {
  if (!result) return 'warning';
  if (result.status === 'fail') return 'blocked';
  return isFresh(result) ? 'ready' : 'warning';
}

export function getHardwareCertificationSummary(
  results = getHardwareTestResults(),
): HardwareCertificationSummary {
  const latestByType = new Map<HardwareTestType, HardwareTestResult>();
  for (const result of results) {
    if (!latestByType.has(result.type)) latestByType.set(result.type, result);
  }

  let readyCount = 0;
  let warningCount = 0;
  let blockedCount = 0;
  for (const type of REQUIRED_CERTIFICATIONS) {
    const readiness = resultReadiness(latestByType.get(type) ?? null);
    if (readiness === 'ready') readyCount += 1;
    else if (readiness === 'blocked') blockedCount += 1;
    else warningCount += 1;
  }

  const state = blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'ready';
  const detail = state === 'ready'
    ? 'All required hardware certifications are fresh.'
    : state === 'blocked'
      ? `${blockedCount} certification${blockedCount === 1 ? '' : 's'} failed.`
      : `${warningCount} certification${warningCount === 1 ? '' : 's'} missing or older than ${CERTIFICATION_FRESH_DAYS} days.`;

  return {
    state,
    readyCount,
    warningCount,
    blockedCount,
    totalRequired: REQUIRED_CERTIFICATIONS.length,
    detail,
  };
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
    readinessState: input.status === 'pass' ? 'ready' : 'blocked',
    freshness: 'fresh',
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
