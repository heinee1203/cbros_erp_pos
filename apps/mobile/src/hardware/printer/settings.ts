import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import type { PrinterProvider, PrintResult, ReceiptData } from './types';
import {
  addPrintJob,
  getAutoRetryPrintJobs,
  updatePrintJob,
  type PrintJob,
  type PrintJobType,
} from '@/storage/print-jobs';

export type PrinterLanguage = 'escpos' | 'zpl';

const PRINT_TIMEOUT_MS = 20_000;
const AUTO_RETRY_BATCH_LIMIT = 3;
const RETRY_BACKOFF_MS = [15_000, 60_000, 300_000, 900_000, 1_800_000];
let autoRetryInFlight = false;

interface PrintQueueOptions {
  type?: PrintJobType;
  title?: string;
  sourceId?: string;
}

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
  options: PrintQueueOptions = {},
): Promise<PrintResult> {
  const job = addPrintJob({
    type: options.type ?? 'receipt',
    title: options.title ?? `Receipt ${receipt.transaction.receiptNumber}`,
    sourceId: options.sourceId ?? receipt.transaction.receiptNumber,
    printerLanguage: 'escpos',
    payload: { receipt },
  });

  return runQueuedPrintJob(
    printer,
    job,
    () => printer.printReceipt(receipt),
    'Receipt printer did not respond. Check power, paper, and Bluetooth connection.',
    'Receipt printer failed to print.',
  );
}

export async function printEscposRawSafely(
  printer: PrinterProvider,
  data: Uint8Array,
  options: PrintQueueOptions = {},
): Promise<PrintResult> {
  const job = addPrintJob({
    type: options.type ?? 'receipt',
    title: options.title ?? 'Receipt print job',
    sourceId: options.sourceId,
    printerLanguage: 'escpos',
    payload: { rawBytes: Array.from(data) },
  });

  return runQueuedPrintJob(
    printer,
    job,
    () => printer.printRaw(data),
    'Receipt printer did not respond. Check power, paper, and Bluetooth connection.',
    'Receipt printer failed to print.',
  );
}

export async function printZplSafely(
  printer: PrinterProvider,
  zpl: string,
  options: PrintQueueOptions = {},
): Promise<PrintResult> {
  const job = addPrintJob({
    type: options.type ?? 'barcode-label',
    title: options.title ?? 'Barcode label',
    sourceId: options.sourceId,
    printerLanguage: 'zpl',
    payload: { zpl },
  });

  return runQueuedPrintJob(
    printer,
    job,
    () => printer.printRaw(asciiBytes(zpl)),
    'Label printer did not respond. Check power, paper, and Bluetooth connection.',
    'Label printer failed to print.',
  );
}

export async function retryPrintJobSafely(
  printer: PrinterProvider,
  job: PrintJob,
  options: { attemptReason?: 'manual' | 'auto' } = {},
): Promise<PrintResult> {
  const attemptReason = options.attemptReason ?? 'manual';
  if (job.payload.receipt) {
    return runQueuedPrintJob(
      printer,
      job,
      () => printer.printReceipt(job.payload.receipt as ReceiptData),
      'Receipt printer did not respond. Check power, paper, and Bluetooth connection.',
      'Receipt printer failed to print.',
      attemptReason,
    );
  }

  if (job.payload.rawBytes) {
    const bytes = new Uint8Array(job.payload.rawBytes);
    return runQueuedPrintJob(
      printer,
      job,
      () => printer.printRaw(bytes),
      'Receipt printer did not respond. Check power, paper, and Bluetooth connection.',
      'Receipt printer failed to print.',
      attemptReason,
    );
  }

  if (job.payload.zpl) {
    return runQueuedPrintJob(
      printer,
      job,
      () => printer.printRaw(asciiBytes(job.payload.zpl as string)),
      'Label printer did not respond. Check power, paper, and Bluetooth connection.',
      'Label printer failed to print.',
      attemptReason,
    );
  }

  updatePrintJob(job.id, {
    status: 'failed',
    lastError: 'Print job payload is missing.',
    lastAttemptReason: attemptReason,
  });
  return { success: false, error: 'Print job payload is missing.', jobId: job.id };
}

export async function runAutoPrintRetryCycle(
  printer: PrinterProvider,
): Promise<{ attempted: number; printed: number; failed: number }> {
  if (autoRetryInFlight || !printer.isConnected) {
    return { attempted: 0, printed: 0, failed: 0 };
  }

  autoRetryInFlight = true;
  let printed = 0;
  let failed = 0;
  try {
    const language = getPrinterLanguage();
    const jobs = getAutoRetryPrintJobs()
      .filter(job => job.printerLanguage === language)
      .slice(0, AUTO_RETRY_BATCH_LIMIT);

    for (const job of jobs) {
      const result = await retryPrintJobSafely(printer, job, { attemptReason: 'auto' });
      if (result.success) printed += 1;
      else failed += 1;
    }

    return { attempted: jobs.length, printed, failed };
  } finally {
    autoRetryInFlight = false;
  }
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

async function runQueuedPrintJob(
  printer: PrinterProvider,
  job: PrintJob,
  printTask: () => Promise<PrintResult>,
  timeoutMessage: string,
  fallbackMessage: string,
  attemptReason: 'initial' | 'manual' | 'auto' = 'initial',
): Promise<PrintResult> {
  const language = getPrinterLanguage();
  const requiredLanguage = job.printerLanguage;
  const connectionError = requiredLanguage === 'zpl'
    ? 'No label printer connected. Open Printer Setup and connect a ZPL label printer first.'
    : 'No receipt printer connected. Open Printer Setup and connect one first.';
  const languageError = requiredLanguage === 'zpl'
    ? 'Connected printer is set to Receipt (ESC/POS). Switch it to Label (ZPL) in Printer Setup before retrying.'
    : 'Connected printer is set to Label (ZPL). Switch it to Receipt (ESC/POS) in Printer Setup before retrying.';

  const attempts = (job.attempts ?? 0) + 1;
  const autoRetryCount = attemptReason === 'auto'
    ? (job.autoRetryCount ?? 0) + 1
    : (job.autoRetryCount ?? 0);

  updatePrintJob(job.id, {
    status: 'printing',
    attempts,
    autoRetryCount,
    lastError: undefined,
    lastAttemptReason: attemptReason,
    nextRetryAt: undefined,
  });

  let result: PrintResult;
  if (!printer.isConnected) {
    result = { success: false, error: connectionError, jobId: job.id };
  } else if (language !== requiredLanguage) {
    result = { success: false, error: languageError, jobId: job.id };
  } else {
    result = await printWithTimeout(printTask, timeoutMessage, fallbackMessage);
  }

  updatePrintJob(job.id, {
    status: result.success ? 'printed' : 'failed',
    lastError: result.success ? undefined : result.error,
    nextRetryAt: result.success ? undefined : getNextRetryAt(autoRetryCount),
  });

  return { ...result, jobId: job.id };
}

function getNextRetryAt(autoRetryCount: number): string {
  const delayMs = RETRY_BACKOFF_MS[Math.min(autoRetryCount, RETRY_BACKOFF_MS.length - 1)];
  return new Date(Date.now() + delayMs).toISOString();
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
