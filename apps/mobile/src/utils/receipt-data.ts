import type { ReceiptData } from '@/hardware/printer/types';
import type { SaleDetail } from '@/hooks/use-transactions';
import { formatApiDateTime } from '@/utils/datetime';

export function formatPaymentMethod(method?: string): string {
  const map: Record<string, string> = {
    ACCOUNT: 'CHARGE TO ACCOUNT',
    BANK_TRANSFER: 'BANK',
    CASH: 'CASH',
    CREDIT_CARD: 'CARD',
    DEBIT_CARD: 'DEBIT',
    EFT: 'EFT',
    GCASH: 'GCASH',
    MAYA: 'MAYA',
    OTHER: 'OTHER',
    QRPH: 'QRPH',
  };
  return method ? map[method] ?? method : 'CASH';
}

export function buildSaleReceiptData(
  sale: SaleDetail,
  cashierName: string,
  footerMessage = '** REPRINT **',
): ReceiptData {
  const payments = sale.payments.map(p => ({
    method: formatPaymentMethod(p.method),
    amount: parseFloat(p.amount),
    reference: p.reference || undefined,
    installmentTerm: p.notes?.includes('Installment:')
      ? p.notes.replace('Installment: ', '').replace(' ', '_').toUpperCase()
      : undefined,
  }));

  return {
    header: {
      storeName: sale.location?.name || 'CBROS GENUINE AUTOPARTS',
      address: sale.location?.address || undefined,
    },
    transaction: {
      receiptNumber: sale.receiptNumber || sale.saleNo,
      date: formatApiDateTime(sale.completedAt ?? sale.createdAt, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      cashier: cashierName,
      lines: sale.lines.map(l => ({
        name: l.productName,
        qty: l.quantity,
        unitPrice: parseFloat(l.overridePrice || l.unitPrice),
        total: parseFloat(l.lineTotal),
      })),
      subtotal: parseFloat(sale.subtotal),
      discount: parseFloat(sale.discountTotal),
      grandTotal: parseFloat(sale.grandTotal),
      paymentMethod: payments.length > 1 ? 'SPLIT' : payments[0]?.method || 'CASH',
      payments,
    },
    footer: { message: footerMessage },
  };
}
