import type { PendingSale } from '@/storage/pending-sales';

export interface PendingSaleSummary {
  total: number;
  retryable: number;
  failed: number;
  reconciling: number;
  fullyOffline: number;
  completionOnly: number;
  totalPayments: number;
  oldestAgeLabel: string;
}

export interface PendingSaleReviewRow {
  id: string;
  title: string;
  detail: string;
  amountLabel: string;
  ageLabel: string;
  statusLabel: string;
  tone: 'warning' | 'danger' | 'info';
}

function parseMoney(value: string | number | null | undefined): number {
  const num = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  return Number.isFinite(num) ? num : 0;
}

function formatPHP(amount: number): string {
  return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAgeFromTimestamp(value: string | null | undefined): string {
  if (!value) return 'unknown age';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'unknown age';

  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function paymentTotal(sale: PendingSale): number {
  return sale.payload.payments.reduce((sum, payment) => sum + parseMoney(payment.amount), 0);
}

function saleTitle(sale: PendingSale): string {
  const receipt = sale.createPayload?.receiptNumber?.trim();
  if (receipt) return receipt;
  if (sale.saleId) return `Sale ${sale.saleId.slice(0, 8)}`;
  return `Pending ${sale.idempotencyKey.slice(0, 8)}`;
}

function statusLabel(sale: PendingSale): string {
  if (sale.status === 'failed') return 'Manager review';
  if (sale.status === 'reconciling') return 'Reconciling';
  return 'Waiting to sync';
}

function paymentMethodsLabel(sale: PendingSale): string {
  const methods = Array.from(new Set(sale.payload.payments.map(payment => payment.method.toUpperCase())));
  return methods.length ? methods.join('+') : 'NO PAYMENT';
}

function retryLabel(sale: PendingSale): string {
  if (sale.status === 'failed') return 'Retry requires manager review';
  if (!sale.lastAttemptAt) return 'Next retry: now';
  const nextRetry = Date.parse(sale.lastAttemptAt) + 5 * 60_000;
  if (!Number.isFinite(nextRetry) || nextRetry <= Date.now()) return 'Next retry: now';
  return `Next retry ${formatAgeFromTimestamp(new Date(nextRetry).toISOString()).replace('ago', 'from now')}`;
}

export function summarizePendingSales(pendingSales: PendingSale[]): PendingSaleSummary {
  const oldest = pendingSales.reduce<string | null>((current, sale) => {
    if (!sale.createdAt) return current;
    if (!current) return sale.createdAt;
    return Date.parse(sale.createdAt) < Date.parse(current) ? sale.createdAt : current;
  }, null);

  return {
    total: pendingSales.length,
    retryable: pendingSales.filter(sale => sale.status !== 'failed').length,
    failed: pendingSales.filter(sale => sale.status === 'failed').length,
    reconciling: pendingSales.filter(sale => sale.status === 'reconciling').length,
    fullyOffline: pendingSales.filter(sale => !sale.saleId && !!sale.createPayload).length,
    completionOnly: pendingSales.filter(sale => !!sale.saleId).length,
    totalPayments: pendingSales.reduce((sum, sale) => sum + paymentTotal(sale), 0),
    oldestAgeLabel: oldest ? formatAgeFromTimestamp(oldest) : 'none',
  };
}

export function getPendingSaleReviewRows(
  pendingSales: PendingSale[],
  limit = 3,
): PendingSaleReviewRow[] {
  return [...pendingSales]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, limit)
    .map(sale => {
      const amount = paymentTotal(sale);
      const offlineKind = sale.saleId ? 'Created sale needs completion' : 'Fully offline sale';
      const attempts = sale.attempts === 1 ? '1 attempt' : `${sale.attempts} attempts`;
      const lastAttempt = sale.lastAttemptAt ? `Last tried ${formatAgeFromTimestamp(sale.lastAttemptAt)}` : 'Not tried yet';
      const receipt = sale.createPayload?.receiptNumber || sale.saleId || sale.idempotencyKey.slice(0, 8);
      const baseDetail = [
        offlineKind,
        `receipt ${receipt}`,
        paymentMethodsLabel(sale),
        attempts,
        lastAttempt,
        retryLabel(sale),
      ].join(' / ');
      const detail = sale.status === 'failed' && sale.failureReason
        ? `${sale.failureReason} / ${baseDetail}`
        : baseDetail;

      return {
        id: sale.idempotencyKey,
        title: saleTitle(sale),
        detail,
        amountLabel: formatPHP(amount),
        ageLabel: formatAgeFromTimestamp(sale.createdAt),
        statusLabel: statusLabel(sale),
        tone: sale.status === 'failed' ? 'danger' : sale.status === 'reconciling' ? 'info' : 'warning',
      };
    });
}
