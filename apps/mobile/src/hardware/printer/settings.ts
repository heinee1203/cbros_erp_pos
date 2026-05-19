import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import type { PrinterProvider, PrintResult, ReceiptData } from './types';

export type PrinterLanguage = 'escpos' | 'zpl';

const PRINT_TIMEOUT_MS = 20_000;

export function getPrinterLanguage(): PrinterLanguage {
  const value = storage.getString(KEYS.PRINTER_LANGUAGE);
  return value === 'zpl' ? 'zpl' : 'escpos';
}

export function setPrinterLanguage(language: PrinterLanguage): void {
  storage.set(KEYS.PRINTER_LANGUAGE, language);
}

export function getPrinterLanguageLabel(language: PrinterLanguage = getPrinterLanguage()): string {
  return language === 'zpl' ? 'Label (ZPL)' : 'Receipt (ESC/POS)';
}

export async function printReceiptSafely(
  printer: PrinterProvider,
  receipt: ReceiptData,
): Promise<PrintResult> {
  if (!printer.isConnected) {
    return { success: false, error: 'No receipt printer connected. Open Printer Setup and connect one first.' };
  }
  if (getPrinterLanguage() !== 'escpos') {
    return { success: false, error: 'Connected printer is set to Label (ZPL). Switch it to Receipt (ESC/POS) in Printer Setup.' };
  }
  return printWithTimeout(
    () => printer.printReceipt(receipt),
    'Receipt printer did not respond. Check power, paper, and Bluetooth connection.',
    'Receipt printer failed to print.',
  );
}

export async function printEscposRawSafely(
  printer: PrinterProvider,
  data: Uint8Array,
): Promise<PrintResult> {
  if (!printer.isConnected) {
    return { success: false, error: 'No receipt printer connected. Open Printer Setup and connect one first.' };
  }
  if (getPrinterLanguage() !== 'escpos') {
    return { success: false, error: 'Connected printer is set to Label (ZPL). Switch it to Receipt (ESC/POS) in Printer Setup.' };
  }
  return printWithTimeout(
    () => printer.printRaw(data),
    'Receipt printer did not respond. Check power, paper, and Bluetooth connection.',
    'Receipt printer failed to print.',
  );
}

export async function printZplSafely(
  printer: PrinterProvider,
  zpl: string,
): Promise<PrintResult> {
  if (!printer.isConnected) {
    return { success: false, error: 'No label printer connected. Open Printer Setup and connect a ZPL label printer first.' };
  }
  if (getPrinterLanguage() !== 'zpl') {
    return { success: false, error: 'Connected printer is set to Receipt (ESC/POS). Switch it to Label (ZPL) in Printer Setup before printing labels.' };
  }
  return printWithTimeout(
    () => printer.printRaw(asciiBytes(zpl)),
    'Label printer did not respond. Check power, paper, and Bluetooth connection.',
    'Label printer failed to print.',
  );
}

function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i] = code > 127 ? 0x3f : code;
  }
  return bytes;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function printWithTimeout(
  printTask: () => Promise<PrintResult>,
  timeoutMessage: string,
  fallbackMessage: string,
): Promise<PrintResult> {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ success: false, error: timeoutMessage });
    }, PRINT_TIMEOUT_MS);

    printTask()
      .then(result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ success: false, error: errorMessage(err, fallbackMessage) });
      });
  });
}
