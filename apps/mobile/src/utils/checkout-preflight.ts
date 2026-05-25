export type CheckoutPreflightSeverity = 'blocking' | 'approval';

export interface CheckoutPreflightIssue {
  code: string;
  label: string;
  detail: string;
  severity: CheckoutPreflightSeverity;
}

export interface CheckoutPreflightSummary {
  issues: CheckoutPreflightIssue[];
  blockingIssues: CheckoutPreflightIssue[];
  approvalIssues: CheckoutPreflightIssue[];
  ready: boolean;
  requiresApproval: boolean;
  title: string;
  detail: string;
  primaryIssue: CheckoutPreflightIssue | null;
}

interface SummaryText {
  readyTitle: string;
  readyDetail: string;
  reviewTitle: string;
  approvalTitle: string;
}

interface CartCheckoutPreflightInput {
  lineCount: number;
  unitCount: number;
  customerId?: string | null;
  intent?: string;
  incompleteSerialCount: number;
  stockWarningCount: number;
  hasNegativeStockApproval?: boolean;
}

interface PaymentActionPreflightInput {
  registerLocked: boolean;
  receiptMissing: boolean;
  isProcessing: boolean;
  isFullyPaid: boolean;
  remaining: number;
  cartTotal: number;
  subtotal: number;
  discountTotal: number;
  isCash: boolean;
  cashTendered: number;
  parsedAmount: number;
  appliedPaymentsCount: number;
  splitMode: boolean;
  nonCashOverpay: boolean;
  needsReference: boolean;
  hasReference: boolean;
  customerRequired: boolean;
  hasCustomer: boolean;
  isOnline: boolean;
  hasOfflineSensitiveTender: boolean;
}

const HIGH_CART_TOTAL_WARNING = 50000;
const LARGE_DISCOUNT_AMOUNT = 5000;
const LARGE_DISCOUNT_RATE = 0.2;
const MONEY_EPSILON = 0.005;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function buildSummary(
  issues: CheckoutPreflightIssue[],
  text: SummaryText,
): CheckoutPreflightSummary {
  const blockingIssues = issues.filter(issue => issue.severity === 'blocking');
  const approvalIssues = issues.filter(issue => issue.severity === 'approval');
  const primaryIssue = blockingIssues[0] ?? approvalIssues[0] ?? null;
  const ready = issues.length === 0;
  const requiresApproval = blockingIssues.length === 0 && approvalIssues.length > 0;

  return {
    issues,
    blockingIssues,
    approvalIssues,
    ready,
    requiresApproval,
    title: ready
      ? text.readyTitle
      : requiresApproval
        ? text.approvalTitle
        : text.reviewTitle,
    detail: ready ? text.readyDetail : primaryIssue?.detail ?? text.readyDetail,
    primaryIssue,
  };
}

export function buildCartCheckoutPreflight(input: CartCheckoutPreflightInput): CheckoutPreflightSummary {
  const issues: CheckoutPreflightIssue[] = [];

  if (input.lineCount <= 0) {
    issues.push({
      code: 'empty-cart',
      label: 'Cart is empty',
      detail: 'Add at least one product before checkout.',
      severity: 'blocking',
    });
  }

  if (input.intent === 'CHARGE' && !input.customerId) {
    issues.push({
      code: 'charge-customer-required',
      label: 'Customer required',
      detail: 'Attach a customer before charging the sale to an account.',
      severity: 'blocking',
    });
  }

  if (input.incompleteSerialCount > 0) {
    issues.push({
      code: 'serials-required',
      label: 'Serial numbers required',
      detail: `Complete ${plural(input.incompleteSerialCount, 'serial task')} before checkout.`,
      severity: 'blocking',
    });
  }

  if (input.stockWarningCount > 0 && !input.hasNegativeStockApproval) {
    issues.push({
      code: 'negative-stock-approval',
      label: 'Stock authorization needed',
      detail: `Manager approval is required for ${plural(input.stockWarningCount, 'line')} going into negative inventory.`,
      severity: 'approval',
    });
  }

  return buildSummary(issues, {
    readyTitle: 'Ready for checkout',
    readyDetail: `${plural(input.lineCount, 'product')} and ${plural(input.unitCount, 'unit')} ready. No stock or serial blockers detected.`,
    reviewTitle: 'Checkout needs review',
    approvalTitle: 'Manager approval required',
  });
}

export function buildPaymentActionPreflight(input: PaymentActionPreflightInput): CheckoutPreflightSummary {
  const issues: CheckoutPreflightIssue[] = [];

  if (!input.registerLocked) {
    issues.push({
      code: 'register-unlocked',
      label: 'Register not store locked',
      detail: 'This register must be locked to a store before taking payment.',
      severity: 'blocking',
    });
  }

  if (input.isProcessing) {
    issues.push({
      code: 'checkout-processing',
      label: 'Checkout in progress',
      detail: 'Wait for the current checkout request to finish.',
      severity: 'blocking',
    });
  }

  if (input.receiptMissing) {
    issues.push({
      code: 'receipt-required',
      label: 'Receipt number required',
      detail: 'Enter or generate a receipt number before completing payment.',
      severity: 'blocking',
    });
  }

  if (input.customerRequired && !input.hasCustomer) {
    issues.push({
      code: 'charge-customer-required',
      label: 'Customer required',
      detail: 'Attach a customer before charging this sale to an account.',
      severity: 'blocking',
    });
  }

  if (!input.isOnline && input.hasOfflineSensitiveTender) {
    issues.push({
      code: 'offline-sensitive-tender',
      label: 'Online verification required',
      detail: 'Card, transfer, wallet, cheque, and charge payments must be verified online before checkout.',
      severity: 'blocking',
    });
  }

  if (input.cartTotal >= HIGH_CART_TOTAL_WARNING) {
    issues.push({
      code: 'high-cart-total',
      label: 'High cart total',
      detail: `Review this ${input.cartTotal.toFixed(2)} sale before completing checkout.`,
      severity: 'approval',
    });
  }

  const discountBase = Math.max(input.subtotal, input.cartTotal + input.discountTotal, 0);
  const discountRate = discountBase > MONEY_EPSILON ? input.discountTotal / discountBase : 0;
  if (input.discountTotal >= LARGE_DISCOUNT_AMOUNT || discountRate >= LARGE_DISCOUNT_RATE) {
    issues.push({
      code: 'large-discount',
      label: 'Large discount',
      detail: 'Review the cart discount before taking payment.',
      severity: 'approval',
    });
  }

  if (!input.isFullyPaid) {
    if (input.isCash) {
      if (input.cashTendered <= 0) {
        issues.push({
          code: 'cash-tender-required',
          label: 'Enter cash tendered',
          detail: 'Type the cash received from the customer before adding or completing payment.',
          severity: 'blocking',
        });
      }

      if (
        input.cashTendered > MONEY_EPSILON
        && input.cashTendered < input.remaining - MONEY_EPSILON
        && !input.splitMode
        && input.appliedPaymentsCount === 0
      ) {
        issues.push({
          code: 'cash-under-tender',
          label: 'Cash under tender',
          detail: 'Cash received is less than the balance. Add it as a split payment or collect the full amount.',
          severity: 'approval',
        });
      }
    } else {
      if (input.parsedAmount <= 0) {
        issues.push({
          code: 'payment-amount-required',
          label: 'Payment amount required',
          detail: 'Enter a payment amount before adding this tender.',
          severity: 'blocking',
        });
      }

      if (input.nonCashOverpay) {
        issues.push({
          code: 'non-cash-overpay',
          label: 'Amount exceeds balance',
          detail: 'Non-cash payments cannot exceed the remaining balance.',
          severity: 'blocking',
        });
      }
    }

    if (input.needsReference && !input.hasReference) {
      issues.push({
        code: 'reference-required',
        label: 'Reference required',
        detail: 'Enter the approval, reference, or trace number for this payment.',
        severity: 'blocking',
      });
    }
  }

  return buildSummary(issues, {
    readyTitle: input.isFullyPaid ? 'Ready to complete sale' : 'Ready to add payment',
    readyDetail: input.isFullyPaid
      ? 'All required payment details are complete.'
      : `This tender can be applied. Remaining balance is ${input.remaining.toFixed(2)}.`,
    reviewTitle: 'Payment needs review',
    approvalTitle: 'Approval required',
  });
}
