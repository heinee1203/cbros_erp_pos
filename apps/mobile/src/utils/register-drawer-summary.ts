import type { RegisterDrawerEvent } from '@/storage/register-drawer-events';

export interface RegisterDrawerRecoverySummary {
  total: number;
  retryable: number;
  failed: number;
  noSaleCount: number;
  paidInTotal: number;
  paidOutTotal: number;
  netCashImpact: number;
  oldestAgeLabel: string;
}

export interface RegisterDrawerRecoveryRow {
  id: string;
  title: string;
  detail: string;
  amountLabel: string;
  ageLabel: string;
  statusLabel: string;
  tone: 'warning' | 'danger' | 'info';
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

function actionLabel(type: RegisterDrawerEvent['type']): string {
  if (type === 'PAID_IN') return 'Paid In';
  if (type === 'PAID_OUT') return 'Paid Out';
  return 'No Sale';
}

function statusLabel(event: RegisterDrawerEvent): string {
  if (event.syncStatus === 'failed') return 'Manager retry';
  if (event.syncStatus === 'pending') return 'Waiting to sync';
  return 'Needs sync';
}

function amountLabel(event: RegisterDrawerEvent): string {
  if (event.type === 'NO_SALE') return 'No cash';
  return formatPHP(event.amount);
}

export function summarizeRegisterDrawerRecovery(
  events: RegisterDrawerEvent[],
): RegisterDrawerRecoverySummary {
  const oldest = events.reduce<string | null>((current, event) => {
    if (!event.createdAt) return current;
    if (!current) return event.createdAt;
    return Date.parse(event.createdAt) < Date.parse(current) ? event.createdAt : current;
  }, null);

  return events.reduce<RegisterDrawerRecoverySummary>((summary, event) => {
    summary.total += 1;
    if (event.syncStatus === 'failed') summary.failed += 1;
    else summary.retryable += 1;

    if (event.type === 'NO_SALE') {
      summary.noSaleCount += 1;
    } else if (event.type === 'PAID_IN') {
      summary.paidInTotal += event.amount;
      summary.netCashImpact += event.amount;
    } else if (event.type === 'PAID_OUT') {
      summary.paidOutTotal += event.amount;
      summary.netCashImpact -= event.amount;
    }

    return summary;
  }, {
    total: 0,
    retryable: 0,
    failed: 0,
    noSaleCount: 0,
    paidInTotal: 0,
    paidOutTotal: 0,
    netCashImpact: 0,
    oldestAgeLabel: oldest ? formatAgeFromTimestamp(oldest) : 'none',
  });
}

export function getRegisterDrawerRecoveryRows(
  events: RegisterDrawerEvent[],
  limit = 3,
): RegisterDrawerRecoveryRow[] {
  return [...events]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, limit)
    .map(event => {
      const detailParts = [
        event.reason || 'No reason entered',
        event.approvedBy ? `approved by ${event.approvedBy}` : null,
        event.drawerError ? `drawer issue: ${event.drawerError}` : null,
        event.syncError,
      ].filter(Boolean);

      return {
        id: event.id,
        title: actionLabel(event.type),
        detail: detailParts.join(' / '),
        amountLabel: amountLabel(event),
        ageLabel: formatAgeFromTimestamp(event.createdAt),
        statusLabel: statusLabel(event),
        tone: event.syncStatus === 'failed' ? 'danger' : 'warning',
      };
    });
}
