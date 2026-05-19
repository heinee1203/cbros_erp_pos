import { ESCPOSBuilder, fmtPHP } from './escpos-builder';
import type { ZReadingData } from '@/hooks/use-shift';

/**
 * Build an ESC/POS Z-reading or X-reading receipt.
 * mode: 'close' = Z-READING / END OF DAY REPORT
 * mode: 'view'  = X-READING / MID-DAY SUMMARY
 */
export function buildZReadingReceipt(
  data: ZReadingData,
  mode: 'view' | 'close',
  paperWidth: '58mm' | '80mm' = '80mm',
): Uint8Array {
  const b = new ESCPOSBuilder(paperWidth);
  const drawerEvents = data.accountability.drawerEvents ?? [];
  const drawerSummary = summarizeDrawerEvents(drawerEvents);

  const title = mode === 'close'
    ? 'Z-READING / END OF DAY'
    : 'X-READING / MID-DAY SUMMARY';

  // Header
  b.initialize()
    .alignCenter()
    .bold(true)
    .fontSize(2)
    .text(title)
    .fontSize(1)
    .bold(false)
    .newline()
    .text(data.locationName)
    .text(data.cashierName)
    .text(formatDateTime(data.openedAt))
    .alignLeft()
    .separator('=');

  // 1. Sales Summary
  b.bold(true).text('SALES SUMMARY').bold(false)
    .separator('-')
    .columns('Gross Sales', fmtPHP(parseFloat(data.salesSummary.grossSales)))
    .columns('Refunds', `-${fmtPHP(parseFloat(data.salesSummary.refundsTotal))}`)
    .separator('-')
    .bold(true)
    .columns('NET SALES', fmtPHP(parseFloat(data.salesSummary.netSales)))
    .bold(false)
    .separator('-')
    .columns('Transactions', String(data.salesSummary.transactionCount))
    .columns('Avg Ticket', fmtPHP(parseFloat(data.salesSummary.avgTicket)))
    .columns('Voids', String(data.salesSummary.voidCount))
    .separator('=');

  // 2. Payment Breakdown
  b.bold(true).text('PAYMENT BREAKDOWN').bold(false)
    .separator('-');
  if (data.paymentBreakdown.length === 0) {
    b.text('  No payments');
  } else {
    for (const p of data.paymentBreakdown) {
      b.columns(`${formatMethod(p.method)} (${p.count})`, fmtPHP(parseFloat(p.total)));
    }
  }
  b.separator('=');

  // 3. Cash Reconciliation
  b.bold(true).text('CASH RECONCILIATION').bold(false)
    .separator('-')
    .columns('Opening Float', fmtPHP(parseFloat(data.openingFloat)))
    .columns('Expected Cash', fmtPHP(parseFloat(data.cashReconciliation.expectedCash)));

  if (drawerEvents.length > 0) {
    b.columns('Paid In', fmtPHP(drawerSummary.paidInTotal))
      .columns('Paid Out', `-${fmtPHP(drawerSummary.paidOutTotal)}`)
      .columns('Drawer Net', formatSignedAmount(drawerSummary.netCash));
  }

  if (data.cashReconciliation.actualCash !== null) {
    b.columns('Actual Cash', fmtPHP(parseFloat(data.cashReconciliation.actualCash)));
  }
  if (data.cashReconciliation.variance !== null) {
    const v = parseFloat(data.cashReconciliation.variance);
    b.columns('Variance', `${v >= 0 ? '+' : ''}${fmtPHP(v)}`);
  }
  b.separator('=');

  // 4. Top Items
  b.bold(true).text('TOP ITEMS').bold(false)
    .separator('-');
  if (data.topItems.length === 0) {
    b.text('  No items sold');
  } else {
    for (let i = 0; i < data.topItems.length; i++) {
      const item = data.topItems[i];
      b.text(`${i + 1}. ${item.productName}`)
        .columns(`   ${item.mnemonicSku} x${item.unitsSold}`, fmtPHP(parseFloat(item.totalRevenue)));
    }
  }
  b.separator('=');

  // 5. Accountability
  b.bold(true).text('ACCOUNTABILITY').bold(false)
    .separator('-');

  b.text(`Voids (${data.accountability.voids.length})`);
  if (data.accountability.voids.length === 0) {
    b.text('  None');
  } else {
    for (const v of data.accountability.voids) {
      b.columns(`  ${v.saleNo}`, fmtPHP(parseFloat(v.amount)));
    }
  }

  b.newline()
    .text(`Refunds (${data.accountability.refunds.length})`);
  if (data.accountability.refunds.length === 0) {
    b.text('  None');
  } else {
    for (const r of data.accountability.refunds) {
      b.columns(`  ${r.saleNo}`, fmtPHP(parseFloat(r.amount)));
    }
  }

  b.newline()
    .text(`Drawer Events (${drawerEvents.length})`);
  if (drawerEvents.length === 0) {
    b.text('  None');
  } else {
    b.columns('  Paid In', fmtPHP(drawerSummary.paidInTotal))
      .columns('  Paid Out', fmtPHP(drawerSummary.paidOutTotal))
      .columns('  Net', formatSignedAmount(drawerSummary.netCash));

    const printableEvents = drawerEvents.slice(0, 12);
    for (const event of printableEvents) {
      b.columns(`  ${drawerActionLabel(event.type)}`, drawerEventAmountLabel(event))
        .text(`   ${formatDateTime(event.createdAt)}`)
        .text(`   ${truncateText(`Cashier ${event.cashierName}`, paperWidth)}`)
        .text(`   ${truncateText(`Approved ${event.approvedBy} via ${event.authorizationMethod}`, paperWidth)}`);
      if (event.reason) {
        b.text(`   ${truncateText(event.reason, paperWidth)}`);
      }
      if (event.drawerError) {
        b.text(`   Drawer issue: ${truncateText(event.drawerError, paperWidth)}`);
      }
    }
    if (drawerEvents.length > printableEvents.length) {
      b.text(`  +${drawerEvents.length - printableEvents.length} more drawer events`);
    }
  }

  // Footer
  b.separator('=')
    .alignCenter()
    .text(mode === 'close' ? '*** END OF Z-READING ***' : '*** END OF X-READING ***')
    .text(formatDateTime(new Date().toISOString()))
    .newline()
    .cut();

  return b.build();
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMethod(method: string): string {
  const map: Record<string, string> = {
    CASH: 'Cash',
    CREDIT_CARD: 'Credit Card',
    DEBIT_CARD: 'Debit Card',
    QRPH: 'QRPH',
    GCASH: 'GCash',
    MAYA: 'Maya',
    BANK_TRANSFER: 'Bank Xfer',
    ACCOUNT: 'Charge',
    EFT: 'EFT',
    CARD: 'Card',
    OTHER: 'Other',
  };
  return map[method] || method;
}

type DrawerEvent = NonNullable<ZReadingData['accountability']['drawerEvents']>[number];

function drawerActionLabel(type: DrawerEvent['type']): string {
  if (type === 'PAID_IN') return 'Paid In';
  if (type === 'PAID_OUT') return 'Paid Out';
  return 'No Sale';
}

function drawerEventAmountLabel(event: DrawerEvent): string {
  if (event.type === 'NO_SALE') return 'Open';
  const amount = parseFloat(event.amount);
  return `${event.type === 'PAID_OUT' ? '-' : '+'}${fmtPHP(Math.abs(amount))}`;
}

function summarizeDrawerEvents(events: DrawerEvent[]) {
  return events.reduce(
    (summary, event) => {
      const amount = parseFloat(event.amount);
      if (!Number.isFinite(amount)) return summary;

      if (event.type === 'PAID_IN') {
        summary.paidInTotal += amount;
        summary.netCash += amount;
      } else if (event.type === 'PAID_OUT') {
        summary.paidOutTotal += amount;
        summary.netCash -= amount;
      }

      return summary;
    },
    { paidInTotal: 0, paidOutTotal: 0, netCash: 0 },
  );
}

function formatSignedAmount(amount: number): string {
  return `${amount >= 0 ? '+' : '-'}${fmtPHP(Math.abs(amount))}`;
}

function truncateText(value: string, paperWidth: '58mm' | '80mm'): string {
  const limit = paperWidth === '58mm' ? 28 : 44;
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}.`;
}
