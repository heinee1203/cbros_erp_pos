import { KEYS } from '@/storage/keys';
import { getJSON, setJSON, storage } from '@/storage/mmkv';
import type { PrinterLanguage } from '@/hardware/printer/settings';

export interface PrintPreviewMetadata {
  lastPreviewedAt: string;
  type: string;
  title: string;
  sourceId?: string;
  printerLanguage: PrinterLanguage;
  printerType?: string;
  copies?: number;
}

export function getLastPrintPreviewMetadata(): PrintPreviewMetadata | null {
  return getJSON<PrintPreviewMetadata>(storage, KEYS.PRINT_PREVIEW_METADATA);
}

export function recordPrintPreviewMetadata(input: Omit<PrintPreviewMetadata, 'lastPreviewedAt'>): void {
  setJSON(storage, KEYS.PRINT_PREVIEW_METADATA, {
    ...input,
    lastPreviewedAt: new Date().toISOString(),
  });
}
