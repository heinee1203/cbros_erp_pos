import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { recordSupportLog } from '@/storage/support-logs';

export type ScannerSource = 'hid' | 'camera' | 'manual' | 'mock' | 'barcode' | 'card';

export interface ScannerDiagnostics {
  mode: string;
  captureActive: boolean;
  captureContext?: string;
  activeSince?: string;
  lastScan?: {
    source: ScannerSource;
    barcodePreview: string;
    format?: string;
    context?: string;
    scannedAt: string;
  };
  lastError?: {
    source: ScannerSource;
    message: string;
    context?: string;
    occurredAt: string;
  };
}

type ScannerDiagnosticsListener = (diagnostics: ScannerDiagnostics) => void;

let listeners: ScannerDiagnosticsListener[] = [];

function currentMode(): string {
  return storage.getString(KEYS.SCANNER_MODE) || 'hid';
}

function sanitizePreview(barcode: string): string {
  const value = barcode.trim();
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function notify(): void {
  const diagnostics = getScannerDiagnostics();
  listeners.forEach(listener => listener(diagnostics));
}

export function getScannerDiagnostics(): ScannerDiagnostics {
  const stored = getJSON<ScannerDiagnostics>(storage, KEYS.SCANNER_DIAGNOSTICS);
  return {
    captureActive: false,
    ...stored,
    mode: currentMode(),
  };
}

export function onScannerDiagnosticsChanged(listener: ScannerDiagnosticsListener): () => void {
  listeners.push(listener);
  listener(getScannerDiagnostics());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
}

export function setScannerCaptureActive(active: boolean, context?: string): void {
  const current = getScannerDiagnostics();
  setJSON(storage, KEYS.SCANNER_DIAGNOSTICS, {
    ...current,
    captureActive: active,
    captureContext: active ? context : undefined,
    activeSince: active ? new Date().toISOString() : undefined,
  });
  notify();
}

export function recordScannerScan(
  source: ScannerSource,
  barcode: string,
  format?: string,
  context?: string,
): void {
  const current = getScannerDiagnostics();
  setJSON(storage, KEYS.SCANNER_DIAGNOSTICS, {
    ...current,
    lastScan: {
      source,
      barcodePreview: sanitizePreview(barcode),
      format,
      context,
      scannedAt: new Date().toISOString(),
    },
    lastError: undefined,
  });
  notify();
}

export function recordScannerError(source: ScannerSource, message: string, context?: string): void {
  const current = getScannerDiagnostics();
  setJSON(storage, KEYS.SCANNER_DIAGNOSTICS, {
    ...current,
    lastError: {
      source,
      message,
      context,
      occurredAt: new Date().toISOString(),
    },
  });
  recordSupportLog({
    category: 'scanner',
    level: 'warning',
    message,
    context: { source, scanContext: context },
  });
  notify();
}
