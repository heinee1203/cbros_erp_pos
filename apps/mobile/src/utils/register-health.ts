import type { PrinterProvider } from '@/hardware/printer/types';
import { getDeviceBinding } from '@/config/device-binding';
import { getPendingSales } from '@/storage/pending-sales';
import { getUnsyncedRegisterDrawerEvents } from '@/storage/register-drawer-events';
import { getPrintJobs, getRetryablePrintJobs } from '@/storage/print-jobs';
import { getScannerDiagnostics } from '@/storage/scanner-diagnostics';
import {
  buildHardwareTestSummaryText,
  getHardwareCertificationSummary,
  getHardwareTestResults,
} from '@/storage/hardware-tests';
import { getDisabledDeviceState } from '@/storage/device-status';
import { buildSupportLogText, getSupportLogs } from '@/storage/support-logs';
import { buildDrawerVarianceHistoryText } from '@/storage/drawer-variance-history';
import { getSupportQrMetadata } from '@/storage/support-qr';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { getSyncStatus } from '@/sync/sync-manager';
import { APP_BUILD_DATE, APP_GIT_SHA, APP_VERSION } from '@/config/app-version';

export interface RegisterHealthSnapshot {
  deviceId: string;
  apiBaseUrl: string;
  appVersion: string;
  build: string;
  gitSha: string;
  disabledState: string;
  supportLogCount: number;
  supportQr: string;
  boundStore: string;
  storeCode: string;
  storeLockStatus: string;
  pendingSales: number;
  drawerEvents: number;
  retryablePrintJobs: number;
  failedPrintJobs: number;
  printerStatus: string;
  printerType: string;
  scannerMode: string;
  scannerCapture: string;
  lastScan: string;
  scannerLastError: string;
  lastHardwareTest: string;
  hardwareCertification: string;
  lastCatalogSync: string;
  lastInventorySync: string;
}

export type ReadinessState = 'ready' | 'warning' | 'blocked';

export interface HardwareReadinessItem {
  id: string;
  label: string;
  detail: string;
  state: ReadinessState;
  actionLabel?: string;
}

function createDeviceId(): string {
  return `apex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getOrCreateDeviceId(): string {
  const existing = storage.getString(KEYS.DEVICE_ID);
  if (existing) return existing;
  const next = createDeviceId();
  storage.set(KEYS.DEVICE_ID, next);
  return next;
}

export function getRegisterHealthSnapshot(printer: PrinterProvider): RegisterHealthSnapshot {
  const binding = getDeviceBinding();
  const syncStatus = getSyncStatus();
  const scanner = getScannerDiagnostics();
  const printJobs = getPrintJobs();
  const failedPrintJobs = printJobs.filter(job => job.status === 'failed').length;
  const hardwareTests = getHardwareTestResults();
  const lastHardwareTest = hardwareTests[0];
  const certification = getHardwareCertificationSummary(hardwareTests);
  const disabledState = getDisabledDeviceState();

  return {
    deviceId: getOrCreateDeviceId(),
    apiBaseUrl: storage.getString(KEYS.API_BASE_URL) || 'http://10.0.2.2:3000',
    appVersion: APP_VERSION,
    build: APP_BUILD_DATE,
    gitSha: APP_GIT_SHA,
    disabledState: disabledState?.disabled
      ? `${disabledState.code || 'BLOCKED'}: ${disabledState.reason || 'Device blocked'}`
      : 'Active',
    supportLogCount: getSupportLogs().length,
    supportQr: getSupportQrMetadata()
      ? `Generated ${new Date(getSupportQrMetadata()!.generatedAt).toLocaleString('en-PH')}`
      : 'Not generated',
    boundStore: binding?.locationName || 'Not registered',
    storeCode: binding?.locationCode || 'None',
    storeLockStatus: binding ? `Locked since ${new Date(binding.boundAt).toLocaleDateString('en-PH')}` : 'Not locked',
    pendingSales: getPendingSales().length,
    drawerEvents: getUnsyncedRegisterDrawerEvents().length,
    retryablePrintJobs: getRetryablePrintJobs().length,
    failedPrintJobs,
    printerStatus: printer.isConnected ? 'Connected' : 'Not connected',
    printerType: printer.type,
    scannerMode: scanner.mode,
    scannerCapture: scanner.captureActive ? `Active: ${scanner.captureContext || 'scanner capture'}` : 'Idle',
    lastScan: scanner.lastScan
      ? `${scanner.lastScan.source} ${scanner.lastScan.barcodePreview} at ${new Date(scanner.lastScan.scannedAt).toLocaleTimeString('en-PH')}`
      : 'None',
    scannerLastError: scanner.lastError
      ? `${scanner.lastError.source}: ${scanner.lastError.message}`
      : 'None',
    lastHardwareTest: lastHardwareTest
      ? `${lastHardwareTest.status.toUpperCase()}: ${lastHardwareTest.title} at ${new Date(lastHardwareTest.createdAt).toLocaleTimeString('en-PH')}`
      : 'None',
    hardwareCertification: `${certification.state.toUpperCase()}: ${certification.readyCount}/${certification.totalRequired} ready - ${certification.detail}`,
    lastCatalogSync: syncStatus.lastCatalogSync || 'Never',
    lastInventorySync: syncStatus.lastInventorySync || 'Never',
  };
}

export function buildHardwareReadinessItems(input: {
  snapshot: RegisterHealthSnapshot;
  apiHealth: string;
  networkOnline: boolean;
  inventoryFreshness: 'fresh' | 'stale' | 'critical';
  syncError?: string | null;
  pendingSaleReviewCount: number;
  drawerReviewCount: number;
}): HardwareReadinessItem[] {
  const {
    snapshot,
    apiHealth,
    networkOnline,
    inventoryFreshness,
    syncError,
    pendingSaleReviewCount,
    drawerReviewCount,
  } = input;

  const apiBlocked = !networkOnline || (
    apiHealth !== 'OK'
    && apiHealth !== 'Not checked'
    && apiHealth !== 'Checking...'
  );

  const items: HardwareReadinessItem[] = [
    {
      id: 'pending-sales',
      label: 'Pending sales',
      detail: snapshot.pendingSales === 0
        ? 'No local sales waiting'
        : `${snapshot.pendingSales} sale${snapshot.pendingSales === 1 ? '' : 's'} waiting; ${pendingSaleReviewCount} need manager review`,
      state: pendingSaleReviewCount > 0 ? 'blocked' : snapshot.pendingSales > 0 ? 'warning' : 'ready',
      actionLabel: snapshot.pendingSales > 0 ? 'Reconcile sales' : undefined,
    },
    {
      id: 'drawer-events',
      label: 'Drawer events',
      detail: snapshot.drawerEvents === 0
        ? 'No local cash drawer events waiting'
        : `${snapshot.drawerEvents} event${snapshot.drawerEvents === 1 ? '' : 's'} waiting; ${drawerReviewCount} need manager sync`,
      state: drawerReviewCount > 0 ? 'blocked' : snapshot.drawerEvents > 0 ? 'warning' : 'ready',
      actionLabel: snapshot.drawerEvents > 0 ? 'Sync drawer events' : undefined,
    },
    {
      id: 'store-lock',
      label: 'Store lock',
      detail: snapshot.disabledState === 'Active' ? snapshot.storeLockStatus : snapshot.disabledState,
      state: snapshot.disabledState !== 'Active' || snapshot.boundStore === 'Not registered' ? 'blocked' : 'ready',
    },
    {
      id: 'api-health',
      label: 'API health',
      detail: networkOnline ? apiHealth : 'Network offline',
      state: apiBlocked ? 'blocked' : apiHealth === 'OK' ? 'ready' : 'warning',
      actionLabel: apiHealth === 'OK' ? undefined : 'Check API',
    },
    {
      id: 'printer',
      label: 'Printer',
      detail: `${snapshot.printerStatus}; ${snapshot.retryablePrintJobs} retryable print job${snapshot.retryablePrintJobs === 1 ? '' : 's'}`,
      state: snapshot.failedPrintJobs > 0 ? 'blocked' : snapshot.printerStatus === 'Connected' ? 'ready' : 'warning',
      actionLabel: snapshot.printerStatus === 'Connected' ? undefined : 'Open printer setup',
    },
    {
      id: 'scanner',
      label: 'Scanner',
      detail: snapshot.scannerLastError === 'None'
        ? `${snapshot.scannerMode}; ${snapshot.scannerCapture}`
        : snapshot.scannerLastError,
      state: snapshot.scannerLastError === 'None' ? 'ready' : 'warning',
    },
    {
      id: 'hardware-certification',
      label: 'Hardware certification',
      detail: snapshot.hardwareCertification,
      state: snapshot.hardwareCertification.startsWith('BLOCKED')
        ? 'blocked'
        : snapshot.hardwareCertification.startsWith('WARNING')
          ? 'warning'
          : 'ready',
    },
    {
      id: 'inventory',
      label: 'Inventory freshness',
      detail: snapshot.lastInventorySync === 'Never' ? 'Inventory has not synced' : snapshot.lastInventorySync,
      state: inventoryFreshness === 'critical' || syncError ? 'blocked' : inventoryFreshness === 'stale' ? 'warning' : 'ready',
      actionLabel: inventoryFreshness === 'fresh' && !syncError ? undefined : 'Run full sync',
    },
    {
      id: 'device',
      label: 'App and device',
      detail: `${snapshot.deviceId}; build ${snapshot.build}; ${snapshot.disabledState}`,
      state: snapshot.disabledState === 'Active' ? 'ready' : 'blocked',
    },
  ];

  return items.sort((a, b) => readinessRank(a.state) - readinessRank(b.state));
}

export function buildReadinessSummaryText(items: HardwareReadinessItem[]): string {
  return items
    .map(item => `${item.state.toUpperCase()}: ${item.label} - ${item.detail}`)
    .join('\n');
}

export function buildSupportDiagnosticText(snapshot: RegisterHealthSnapshot, apiHealth: string): string {
  return [
    'APEX POS SUPPORT DIAGNOSTICS',
    `Device ID: ${snapshot.deviceId}`,
    `App: ${snapshot.appVersion} (${snapshot.build}; ${snapshot.gitSha})`,
    `Store: ${snapshot.boundStore} [${snapshot.storeCode}]`,
    `Store Lock: ${snapshot.storeLockStatus}`,
    `Device Status: ${snapshot.disabledState}`,
    `API: ${snapshot.apiBaseUrl}`,
    `API Health: ${apiHealth}`,
    `Printer: ${snapshot.printerStatus} (${snapshot.printerType})`,
    `Scanner: ${snapshot.scannerMode} / ${snapshot.scannerCapture}`,
    `Last Scan: ${snapshot.lastScan}`,
    `Scanner Error: ${snapshot.scannerLastError}`,
    `Last Hardware Test: ${snapshot.lastHardwareTest}`,
    `Hardware Certification: ${snapshot.hardwareCertification}`,
    `Pending Sales: ${snapshot.pendingSales}`,
    `Drawer Events: ${snapshot.drawerEvents}`,
    `Retryable Prints: ${snapshot.retryablePrintJobs}`,
    `Failed Prints: ${snapshot.failedPrintJobs}`,
    `Support Log Count: ${snapshot.supportLogCount}`,
    `Support QR: ${snapshot.supportQr}`,
    `Catalog Sync: ${snapshot.lastCatalogSync}`,
    `Inventory Sync: ${snapshot.lastInventorySync}`,
    'Hardware Tests:',
    buildHardwareTestSummaryText(),
    'Drawer Variance History:',
    buildDrawerVarianceHistoryText(),
    'Support Logs:',
    buildSupportLogText(),
  ].join('\n');
}

function readinessRank(state: ReadinessState): number {
  if (state === 'blocked') return 0;
  if (state === 'warning') return 1;
  return 2;
}
