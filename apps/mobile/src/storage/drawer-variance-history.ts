import { getDeviceBinding } from '@/config/device-binding';
import { APP_BUILD_DATE, APP_VERSION } from '@/config/app-version';
import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export interface DrawerVarianceRecord {
  id: string;
  shiftId: string;
  expectedCash: number;
  actualCash: number;
  variance: number;
  note?: string;
  cashier?: string;
  store?: string;
  storeCode?: string;
  appBuild: string;
  createdAt: string;
}

const MAX_VARIANCE_RECORDS = 120;

function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function getDrawerVarianceHistory(): DrawerVarianceRecord[] {
  return getJSON<DrawerVarianceRecord[]>(storage, KEYS.DRAWER_VARIANCE_HISTORY) ?? [];
}

export function recordDrawerVariance(input: {
  shiftId: string;
  expectedCash: number;
  actualCash: number;
  note?: string;
  cashier?: string;
}): DrawerVarianceRecord {
  const binding = getDeviceBinding();
  const variance = input.actualCash - input.expectedCash;
  const record: DrawerVarianceRecord = {
    id: createId(),
    shiftId: input.shiftId,
    expectedCash: input.expectedCash,
    actualCash: input.actualCash,
    variance,
    note: input.note,
    cashier: input.cashier,
    store: binding?.locationName,
    storeCode: binding?.locationCode,
    appBuild: `${APP_VERSION} (${APP_BUILD_DATE})`,
    createdAt: new Date().toISOString(),
  };
  setJSON(storage, KEYS.DRAWER_VARIANCE_HISTORY, [
    record,
    ...getDrawerVarianceHistory(),
  ].slice(0, MAX_VARIANCE_RECORDS));
  return record;
}

export function buildDrawerVarianceHistoryText(limit = 20): string {
  const records = getDrawerVarianceHistory().slice(0, limit);
  if (records.length === 0) return 'No drawer variance history on this tablet.';
  return records.map(record => [
    new Date(record.createdAt).toLocaleString('en-PH'),
    record.storeCode || 'store unknown',
    `shift ${record.shiftId.slice(0, 8)}`,
    `expected ${record.expectedCash.toFixed(2)}`,
    `actual ${record.actualCash.toFixed(2)}`,
    `variance ${record.variance.toFixed(2)}`,
    record.note || 'no note',
  ].join(' / ')).join('\n');
}
