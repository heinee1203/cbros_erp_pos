import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export interface SupportQrMetadata {
  generatedAt: string;
  source: string;
  length: number;
}

export function getSupportQrMetadata(): SupportQrMetadata | null {
  return getJSON<SupportQrMetadata>(storage, KEYS.SUPPORT_QR_METADATA) ?? null;
}

export function recordSupportQrMetadata(input: Omit<SupportQrMetadata, 'generatedAt'>): void {
  setJSON(storage, KEYS.SUPPORT_QR_METADATA, {
    ...input,
    generatedAt: new Date().toISOString(),
  });
}

export function buildSupportQrPayload(text: string): string {
  const compact = text
    .split('\n')
    .filter(line => !/^Support Logs:/i.test(line))
    .slice(0, 36)
    .join('\n');
  return compact.slice(0, 1800);
}
