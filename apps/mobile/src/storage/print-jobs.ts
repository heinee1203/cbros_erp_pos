import type { ReceiptData } from '@/hardware/printer/types';
import type { PrinterLanguage } from '@/hardware/printer/settings';
import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { recordSupportLog } from '@/storage/support-logs';

export type PrintJobType = 'receipt' | 'z-reading' | 'barcode-label' | 'test-page';
export type PrintJobStatus = 'pending' | 'printing' | 'printed' | 'failed';

export interface PrintJobPayload {
  receipt?: ReceiptData;
  rawBytes?: number[];
  zpl?: string;
}

export interface PrintJob {
  id: string;
  type: PrintJobType;
  title: string;
  status: PrintJobStatus;
  payload: PrintJobPayload;
  printerLanguage: PrinterLanguage;
  attempts: number;
  autoRetryCount: number;
  lastError?: string;
  lastAttemptReason?: 'initial' | 'manual' | 'auto';
  nextRetryAt?: string;
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
}

type PrintJobListener = (jobs: PrintJob[]) => void;

const MAX_PRINT_JOBS = 80;
const MAX_AUTO_RETRY_ATTEMPTS = 5;
let listeners: PrintJobListener[] = [];

function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function notify(): void {
  const jobs = getPrintJobs();
  listeners.forEach(listener => listener(jobs));
}

export function getPrintJobs(): PrintJob[] {
  return (getJSON<PrintJob[]>(storage, KEYS.PRINT_JOBS) ?? []).map(job => ({
    ...job,
    autoRetryCount: job.autoRetryCount ?? 0,
  }));
}

export function getRetryablePrintJobs(): PrintJob[] {
  return getPrintJobs().filter(job => job.status === 'failed' || job.status === 'pending');
}

export function getAutoRetryPrintJobs(now = new Date()): PrintJob[] {
  const nowMs = now.getTime();
  return getPrintJobs().filter(job => {
    if (job.status !== 'failed' && job.status !== 'pending') return false;
    if ((job.autoRetryCount ?? 0) >= MAX_AUTO_RETRY_ATTEMPTS) return false;
    if (!job.nextRetryAt) return true;
    const nextRetryMs = new Date(job.nextRetryAt).getTime();
    return !Number.isFinite(nextRetryMs) || nextRetryMs <= nowMs;
  });
}

export function onPrintJobsChanged(listener: PrintJobListener): () => void {
  listeners.push(listener);
  listener(getPrintJobs());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
}

export function addPrintJob(input: {
  type: PrintJobType;
  title: string;
  payload: PrintJobPayload;
  printerLanguage: PrinterLanguage;
  sourceId?: string;
  status?: PrintJobStatus;
}): PrintJob {
  const now = new Date().toISOString();
  const job: PrintJob = {
    id: createId(),
    type: input.type,
    title: input.title,
    status: input.status ?? 'pending',
    payload: input.payload,
    printerLanguage: input.printerLanguage,
    attempts: 0,
    autoRetryCount: 0,
    lastAttemptReason: 'initial',
    nextRetryAt: now,
    sourceId: input.sourceId,
    createdAt: now,
    updatedAt: now,
  };
  setJSON(storage, KEYS.PRINT_JOBS, [job, ...getPrintJobs()].slice(0, MAX_PRINT_JOBS));
  recordSupportLog({
    category: 'print',
    level: 'info',
    message: `Queued ${job.type} print job`,
    context: { jobId: job.id, printerLanguage: job.printerLanguage },
  });
  notify();
  return job;
}

export function updatePrintJob(id: string, patch: Partial<PrintJob>): PrintJob | null {
  let updated: PrintJob | null = null;
  const jobs = getPrintJobs().map(job => {
    if (job.id !== id) return job;
    updated = {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  setJSON(storage, KEYS.PRINT_JOBS, jobs);
  if (patch.status === 'failed' || patch.status === 'printed') {
    const loggedJob: PrintJob = updated;
    recordSupportLog({
      category: 'print',
      level: patch.status === 'failed' ? 'error' : 'info',
      message: `${loggedJob.type} print job ${patch.status}`,
      detail: loggedJob.lastError,
      context: {
        jobId: loggedJob.id,
        attempts: loggedJob.attempts,
        autoRetryCount: loggedJob.autoRetryCount,
      },
    });
  }
  notify();
  return updated;
}

export function clearPrintedPrintJobs(): void {
  setJSON(storage, KEYS.PRINT_JOBS, getPrintJobs().filter(job => job.status !== 'printed'));
  notify();
}
