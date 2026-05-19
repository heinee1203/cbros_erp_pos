import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { useShallow } from 'zustand/react/shallow';
import { apiFetch, ApiError } from '@/services/api-client';
import { useCartStore, selectGrandTotal, type CartLine, type PaymentEntry } from '@/stores/cart-store';
import { addPendingSale, removePendingSale, updatePendingSale, getPendingSales } from '@/storage/pending-sales';
import { getLockedLocationId } from '@/config/device-binding';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { formatPosError } from '@/utils/pos-error-messages';

export type CheckoutStatus =
  | 'idle'
  | 'creating'
  | 'completing'
  | 'printing'
  | 'success'
  | 'pending_offline'
  | 'error';

interface CheckoutResult {
  saleId: string;
  saleNo: string;
  receiptNumber?: string | null;
  grandTotal: string;
}

export interface CheckoutOverrideApproval {
  pin?: string;
  credential?: string;
  method?: 'pin' | 'barcode' | 'card';
}

interface CompleteSalePayload {
  idempotencyKey: string;
  allowNegativeStock?: boolean;
  overrideApproval?: CheckoutOverrideApproval;
  payments: Array<{
    method: string;
    amount: string;
    reference?: string;
    notes?: string;
  }>;
}

interface RetryableCompletion {
  saleId: string;
  saleNo?: string;
  idempotencyKey: string;
  payload: CompleteSalePayload;
  grandTotal: number;
  createdAt: string;
}

export interface PendingSalesReconciliationSummary {
  total: number;
  synced: number;
  alreadyCompleted: number;
  retryLater: number;
  failed: number;
  skipped: number;
  blockedReason?: 'store_lock';
}

const MONEY_EPSILON = 0.005;
const PAYMENT_METHODS_NEEDING_REFERENCE = new Set([
  'BANK_TRANSFER',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'GCASH',
  'MAYA',
  'QRPH',
]);

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePaymentMethod(method: string): string {
  return method === 'CHARGE' ? 'ACCOUNT' : method;
}

function getPaidTotal(payments: PaymentEntry[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
}

function validateCheckoutPayments(
  payments: PaymentEntry[],
  grandTotal: number,
  customerId: string | null,
): string | null {
  if (grandTotal <= MONEY_EPSILON) return 'Sale total must be greater than zero.';
  if (payments.length === 0) return 'Add a payment before completing the sale.';

  for (const payment of payments) {
    const method = normalizePaymentMethod(payment.method);
    if (!Number.isFinite(payment.amount) || payment.amount <= MONEY_EPSILON) {
      return 'Remove invalid payment amounts before completing the sale.';
    }
    if (method === 'CASH' && payment.cashTendered != null && payment.cashTendered + MONEY_EPSILON < payment.amount) {
      return 'Cash tendered cannot be less than the cash payment amount.';
    }
    if (method === 'ACCOUNT' && !customerId) {
      return 'Charge payments require a customer on the order.';
    }
    if (PAYMENT_METHODS_NEEDING_REFERENCE.has(method) && !payment.reference?.trim()) {
      return `${payment.method} payments require a reference number.`;
    }
  }

  const paidTotal = getPaidTotal(payments);
  if (paidTotal < grandTotal - MONEY_EPSILON) {
    return `Payment is short by ${(grandTotal - paidTotal).toFixed(2)}.`;
  }
  if (paidTotal > grandTotal + MONEY_EPSILON) {
    return `Applied payments exceed the sale total by ${(paidTotal - grandTotal).toFixed(2)}. Remove and re-enter the payment.`;
  }

  return null;
}

function saleField<T>(sale: any, camelKey: string, snakeKey: string): T | undefined {
  return sale?.[camelKey] ?? sale?.[snakeKey];
}

function toCheckoutResult(
  sale: any,
  fallback: { saleId?: string; saleNo?: string; grandTotal: number },
): CheckoutResult {
  const source = sale?.sale ?? sale;
  const rawGrandTotal = saleField<string | number>(source, 'grandTotal', 'grand_total');
  const grandTotalValue = rawGrandTotal ?? fallback.grandTotal;

  return {
    saleId: source?.id ?? fallback.saleId ?? '',
    saleNo: saleField<string>(source, 'saleNo', 'sale_no') ?? fallback.saleNo ?? '',
    receiptNumber: saleField<string | null>(source, 'receiptNumber', 'receipt_number') ?? null,
    grandTotal: typeof grandTotalValue === 'number'
      ? grandTotalValue.toFixed(2)
      : String(grandTotalValue),
  };
}

async function fetchCompletedSaleResult(
  idempotencyKey: string,
  fallback: { saleId?: string; saleNo?: string; grandTotal: number },
): Promise<CheckoutResult | null> {
  try {
    const existing = await apiFetch<any>(
      `/sales/by-idempotency-key/${encodeURIComponent(idempotencyKey)}`,
    );
    return toCheckoutResult(existing, fallback);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

function getLineGross(line: CartLine): number {
  return (line.overridePrice ?? line.unitPrice) * line.quantity;
}

function getLineDiscount(line: CartLine): number {
  return Math.max(0, roundMoney(getLineGross(line) - line.lineTotal));
}

function allocateCartDiscount(
  lines: CartLine[],
  discountType: 'none' | 'percentage' | 'fixed',
  discountValue: number,
): Map<string, number> {
  const allocations = new Map<string, number>();
  if (discountType === 'none' || discountValue <= 0 || lines.length === 0) return allocations;

  const lineNets = lines.map(line => ({
    id: line.id,
    net: Math.max(0, roundMoney(line.lineTotal)),
  }));
  const subtotal = roundMoney(lineNets.reduce((sum, line) => sum + line.net, 0));
  if (subtotal <= 0) return allocations;

  const rawDiscount = discountType === 'percentage'
    ? subtotal * (discountValue / 100)
    : discountValue;
  const totalDiscount = Math.min(subtotal, roundMoney(rawDiscount));
  let remaining = totalDiscount;

  lineNets.forEach((line, index) => {
    if (line.net <= 0 || remaining <= 0) {
      allocations.set(line.id, 0);
      return;
    }

    const amount = index === lineNets.length - 1
      ? remaining
      : Math.min(line.net, roundMoney(totalDiscount * (line.net / subtotal)));
    const rounded = roundMoney(amount);
    allocations.set(line.id, rounded);
    remaining = roundMoney(remaining - rounded);
  });

  return allocations;
}

export function useCheckout() {
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastApiError, setLastApiError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [retryableCompletion, setRetryableCompletion] = useState<RetryableCompletion | null>(null);

  const cart = useCartStore(useShallow(s => ({
    lines: s.lines,
    customerId: s.customerId,
    vehicleId: s.vehicleId,
    receiptNumber: s.receiptNumber,
    note: s.note,
    discountType: s.discountType,
    discountValue: s.discountValue,
    payments: s.payments,
    allowNegativeStock: s.allowNegativeStock,
  })));
  const grandTotal = useCartStore(selectGrandTotal);

  const checkout = useCallback(async (opts?: {
    allowNegativeStock?: boolean;
    overrideApproval?: CheckoutOverrideApproval;
  }) => {
    if (cart.lines.length === 0) {
      setStatus('error');
      setError('Cart is empty');
      return null;
    }
    if (!cart.receiptNumber.trim()) {
      setStatus('error');
      setError('Receipt number is required');
      return null;
    }

    const paymentError = validateCheckoutPayments(cart.payments, grandTotal, cart.customerId);
    if (paymentError) {
      setStatus('error');
      setError(paymentError);
      return null;
    }

    const lockedLocationId = getLockedLocationId();
    if (!lockedLocationId) {
      setStatus('error');
      setError('Register this device to a store before completing sales.');
      return null;
    }

    if (opts?.overrideApproval && retryableCompletion) {
      const retry = retryableCompletion;
      const retryPayload: CompleteSalePayload = {
        ...retry.payload,
        overrideApproval: opts.overrideApproval,
      };

      setStatus('completing');
      setError(null);
      setLastApiError(null);

      addPendingSale({
        idempotencyKey: retry.idempotencyKey,
        saleId: retry.saleId,
        payload: retryPayload,
        createdAt: retry.createdAt,
        attempts: 0,
        lastAttemptAt: null,
        status: 'pending',
      });

      try {
        const completed = await apiFetch<any>(`/sales/${retry.saleId}/complete`, {
          method: 'POST',
          requireLockedLocation: true,
          body: JSON.stringify(retryPayload),
        });

        removePendingSale(retry.idempotencyKey);
        if (cart.receiptNumber?.trim()) {
          storage.set(KEYS.LAST_RECEIPT_NUMBER, cart.receiptNumber.trim());
        }

        const checkoutResult = toCheckoutResult(completed, {
          saleId: retry.saleId,
          saleNo: retry.saleNo,
          grandTotal: retry.grandTotal,
        });

        setRetryableCompletion(null);
        setResult(checkoutResult);
        setStatus('success');
        return checkoutResult;
      } catch (err: any) {
        if (err instanceof ApiError) {
          setLastApiError(err);
          if (err.status === 409) {
            const completed = await fetchCompletedSaleResult(retry.idempotencyKey, {
              saleId: retry.saleId,
              saleNo: retry.saleNo,
              grandTotal: retry.grandTotal,
            });
            if (completed) {
              removePendingSale(retry.idempotencyKey);
              setRetryableCompletion(null);
              setResult(completed);
              setStatus('success');
              return completed;
            }
          }

          if (err.status === 0) {
            setStatus('pending_offline');
            setError('Sale saved. Will complete when online.');
            return null;
          }

          removePendingSale(retry.idempotencyKey);
          setRetryableCompletion({ ...retry, payload: retryPayload });
          setStatus('error');
          setError(formatPosError(err, 'Checkout failed'));
          return null;
        }

        setStatus('error');
        setError(formatPosError(err, 'Checkout failed'));
        return null;
      }
    }

    setStatus('creating');
    setError(null);
    setLastApiError(null);

    const idempotencyKey = uuid();
    const pendingCreatedAt = new Date().toISOString();

    const cartDiscountAllocations = allocateCartDiscount(
      cart.lines,
      cart.discountType,
      cart.discountValue,
    );

    const createPayload = {
      locationId: lockedLocationId,
      customerId: cart.customerId ?? undefined,
      customerVehicleId: cart.vehicleId ?? undefined,
      receiptNumber: cart.receiptNumber?.trim() || undefined,
      notes: cart.note?.trim() || undefined,
      lines: cart.lines.map(l => {
        const gross = getLineGross(l);
        const totalDiscount = Math.min(
          gross,
          roundMoney(getLineDiscount(l) + (cartDiscountAllocations.get(l.id) ?? 0)),
        );

        return {
          productId: l.productId,
          quantity: l.quantity,
          overridePrice: l.overridePrice != null ? String(l.overridePrice.toFixed(2)) : undefined,
          discountAmount: totalDiscount > 0
            ? String(totalDiscount.toFixed(2))
            : undefined,
          serials: l.isSerialized && l.serials.length > 0 ? l.serials : undefined,
          dotAllocation: l.isTire && l.dotAllocation ? l.dotAllocation : undefined,
          technicianId: l.technicianId ?? undefined,
        };
      }),
    };

    const completePayload: CompleteSalePayload = {
      idempotencyKey,
      allowNegativeStock: opts?.allowNegativeStock || undefined,
      overrideApproval: opts?.overrideApproval,
      payments: cart.payments.map(p => ({
        method: normalizePaymentMethod(p.method),
        amount: String(p.amount.toFixed(2)),
        reference: p.reference || undefined,
        notes: p.installmentTerm && p.installmentTerm !== 'STRAIGHT'
          ? `Installment: ${p.installmentTerm.replace('_', ' ')}`
          : undefined,
      })),
    };

    let createdSaleId: string | undefined;
    let createdSaleNo: string | undefined;

    try {
      // Step 1: Create OPEN sale on server
      const createResult = await apiFetch<{ sale: any; lines: any[] }>('/sales', {
        method: 'POST',
        requireLockedLocation: true,
        body: JSON.stringify(createPayload),
      });

      const saleId = createResult.sale.id;
      const saleNo = createResult.sale.saleNo || createResult.sale.sale_no;
      createdSaleId = saleId;
      createdSaleNo = saleNo;

      // Step 2: Complete sale with idempotency key
      setStatus('completing');

      // Store pending sale BEFORE attempting completion (crash safety)
      addPendingSale({
        idempotencyKey,
        saleId,
        payload: completePayload,
        createdAt: pendingCreatedAt,
        attempts: 0,
        lastAttemptAt: null,
        status: 'pending',
      });

      const completed = await apiFetch<any>(`/sales/${saleId}/complete`, {
        method: 'POST',
        requireLockedLocation: true,
        body: JSON.stringify(completePayload),
      });

      // Success — remove from pending queue
      removePendingSale(idempotencyKey);

      // Save receipt number for auto-increment
      if (cart.receiptNumber?.trim()) {
        storage.set(KEYS.LAST_RECEIPT_NUMBER, cart.receiptNumber.trim());
      }

      const checkoutResult = toCheckoutResult(completed, {
        saleId,
        saleNo,
        grandTotal,
      });

      setResult(checkoutResult);
      setRetryableCompletion(null);
      setStatus('success');
      return checkoutResult;
    } catch (err: any) {
      if (err instanceof ApiError) {
        setLastApiError(err);
        if (err.status === 409) {
          // Reconcile completed duplicates before treating 409 as a business error.
          const completed = await fetchCompletedSaleResult(idempotencyKey, {
            saleId: createdSaleId,
            saleNo: createdSaleNo,
            grandTotal,
          });
          if (completed) {
            removePendingSale(idempotencyKey);
            setResult(completed);
            setRetryableCompletion(null);
            setStatus('success');
            return completed;
          }

          removePendingSale(idempotencyKey);
          if (err.body?.code === 'CREDIT_LIMIT_EXCEEDED' && createdSaleId) {
            setRetryableCompletion({
              saleId: createdSaleId,
              saleNo: createdSaleNo,
              idempotencyKey,
              payload: completePayload,
              grandTotal,
              createdAt: pendingCreatedAt,
            });
          }
          setStatus('error');
          setError(formatPosError(err, 'Checkout failed'));
          return null;
        }
        if (err.status === 0) {
          // Network error — queue sale locally for later reconciliation
          // Check if we already stored a pending sale (Step 1 succeeded but Step 2 failed)
          const existingPending = getPendingSales().find(
            s => s.idempotencyKey === idempotencyKey,
          );
          if (!existingPending) {
            // Step 1 failed — store full create + complete payload for offline replay
            addPendingSale({
              idempotencyKey,
              saleId: null,
              payload: completePayload,
              createPayload,
              createdAt: pendingCreatedAt,
              attempts: 0,
              lastAttemptAt: null,
              status: 'pending',
            });
          }
          setStatus('pending_offline');
          setError('Sale saved. Will complete when online.');
          return null;
        }
        // Business error (4xx) — remove from pending, show error
        removePendingSale(idempotencyKey);
        setRetryableCompletion(null);
        setStatus('error');
        setError(formatPosError(err, 'Checkout failed'));
        return null;
      }
      // Unknown error
      setStatus('error');
      setError(formatPosError(err, 'Checkout failed'));
      return null;
    }
  }, [cart, grandTotal, retryableCompletion]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setLastApiError(null);
    setResult(null);
    setRetryableCompletion(null);
  }, []);

  return { status, error, lastApiError, result, checkout, reset };
}

/**
 * Reconcile pending sales on reconnect.
 * Called by network listener when connectivity is restored.
 *
 * RECONCILIATION-FIRST pattern:
 * 1. For each pending sale, check if server already has it (GET by idempotency key)
 * 2. If found → already processed, remove from queue
 * 3. If not found → retry POST with SAME idempotency key
 * 4. Never blind-replay — always reconcile first
 */
export async function reconcilePendingSales(): Promise<PendingSalesReconciliationSummary> {
  const pending = getPendingSales();
  const lockedLocationId = getLockedLocationId();
  const summary: PendingSalesReconciliationSummary = {
    total: pending.length,
    synced: 0,
    alreadyCompleted: 0,
    retryLater: 0,
    failed: 0,
    skipped: 0,
  };

  if (!lockedLocationId) {
    summary.skipped = pending.length;
    summary.blockedReason = 'store_lock';
    return summary;
  }

  for (const sale of pending) {
    if (sale.status === 'failed') {
      summary.skipped += 1;
      continue;
    }

    if (sale.createPayload?.locationId && sale.createPayload.locationId !== lockedLocationId) {
      updatePendingSale(sale.idempotencyKey, {
        status: 'failed',
        lastAttemptAt: new Date().toISOString(),
        failureReason: 'Queued sale belongs to a different store binding.',
      });
      summary.failed += 1;
      continue;
    }

    if (sale.status === 'reconciling' && sale.lastAttemptAt) {
      const startedAt = Date.parse(sale.lastAttemptAt);
      if (!Number.isNaN(startedAt) && Date.now() - startedAt < 30_000) {
        summary.skipped += 1;
        continue;
      }
    }

    updatePendingSale(sale.idempotencyKey, {
      status: 'reconciling',
      attempts: sale.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
    });

    try {
      // Step 1: Check if sale already exists on server (reconcile first)
      const existing = await apiFetch<any>(
        `/sales/by-idempotency-key/${encodeURIComponent(sale.idempotencyKey)}`,
      ).catch((err: ApiError) => {
        if (err.status === 404) return null;
        throw err;
      });

      if (existing) {
        // Sale already completed on server — remove from queue
        removePendingSale(sale.idempotencyKey);
        summary.alreadyCompleted += 1;
        continue;
      }

      if (!sale.saleId && sale.createPayload) {
        // Fully-offline sale: never created on server — replay full flow
        const createResult = await apiFetch<{ sale: any; lines: any[] }>('/sales', {
          method: 'POST',
          requireLockedLocation: true,
          body: JSON.stringify(sale.createPayload),
        });

        const saleId = createResult.sale.id;
        updatePendingSale(sale.idempotencyKey, {
          saleId,
          status: 'pending',
        });

        // Now complete the sale
        await apiFetch<any>(`/sales/${saleId}/complete`, {
          method: 'POST',
          requireLockedLocation: true,
          body: JSON.stringify(sale.payload),
        });

        removePendingSale(sale.idempotencyKey);
        summary.synced += 1;
      } else if (sale.saleId) {
        // Partial-offline: sale was created but completion failed — retry completion
        await apiFetch<any>(`/sales/${sale.saleId}/complete`, {
          method: 'POST',
          requireLockedLocation: true,
          body: JSON.stringify(sale.payload),
        });

        removePendingSale(sale.idempotencyKey);
        summary.synced += 1;
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        // Race condition — already processed between check and retry
        removePendingSale(sale.idempotencyKey);
        summary.alreadyCompleted += 1;
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // Business error — flag for manual review, don't retry
        updatePendingSale(sale.idempotencyKey, {
          status: 'failed',
          failureReason: formatPosError(err, 'Sale could not be reconciled automatically.'),
        });
        summary.failed += 1;
      } else {
        // Network still down — leave as pending for next reconciliation attempt
        updatePendingSale(sale.idempotencyKey, { status: 'pending' });
        summary.retryLater += 1;
      }
    }
  }

  return summary;
}
