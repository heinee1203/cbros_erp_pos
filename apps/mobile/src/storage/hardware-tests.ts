import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

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
  createdAt: string;
}

type HardwareTestListener = (results: HardwareTestResult[]) => void;

const MAX_HARDWARE_TEST_RESULTS = 60;
let listeners: HardwareTestListener[] = [];

function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
    id: createId(),
    type: input.type,
    title: input.title,
    status: input.status,
    operator: input.operator,
    note: input.note,
    error: input.error,
    createdAt: new Date().toISOString(),
  };

  setJSON(storage, KEYS.HARDWARE_TEST_RESULTS, [
    result,
    ...getHardwareTestResults(),
  ].slice(0, MAX_HARDWARE_TEST_RESULTS));
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
  if (results.length === 0) return 'No hardware tests recorded on this tablet.';

  return results.slice(0, 8).map(result => {
    const note = result.error || result.note || 'No note';
    return [
      `${result.status.toUpperCase()}: ${result.title}`,
      note,
      result.operator ? `by ${result.operator}` : 'operator unknown',
      new Date(result.createdAt).toLocaleString('en-PH'),
    ].join(' / ');
  }).join('\n');
}
