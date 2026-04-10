import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { useShallow } from 'zustand/react/shallow';
import { apiFetch, ApiError } from '@/services/api-client';
import { useCartStore, selectGrandTotal, selectSubtotal, selectCartDiscount } from '@/stores/cart-store';
import { addPendingSale, removePendingSale, updatePendingSale, getPendingSales } from '@/storage/pending-sales';
import { getActiveLocation } from '@/services/auth';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

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
  grandTotal: string;
}

export function useCheckout() {
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

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

  const checkout = useCallback(async (opts?: { allowNegativeStock?: boolean }) => {
    if (cart.lines.length === 0) {
      setError('Cart is empty');
      return null;
    }

    setStatus('creating');
    setError(null);

    const idempotencyKey = uuid();

    const locationId = getActiveLocation();
    if (!locationId) {
      setStatus('error');
      setError('No location selected');
      return null;
    }

    const createPayload = {
      locationId,
      customerId: cart.customerId ?? undefined,
      customerVehicleId: cart.vehicleId ?? undefined,
      receiptNumber: cart.receiptNumber?.trim() || undefined,
      notes: cart.note?.trim() || undefined,
      lines: cart.lines.map(l => ({
        productId: l.productId,
        quantity: l.quantity,
        overridePrice: l.overridePrice != null ? String(l.overridePrice.toFixed(2)) : undefined,
        discountAmount: l.discountType !== 'none'
          ? String(l.unitPrice * l.quantity - l.lineTotal)
          : undefined,
        serials: l.isSerialized && l.serials.length > 0 ? l.serials : undefined,
        dotAllocation: l.isTire && l.dotAllocation ? l.dotAllocation : undefined,
        technicianId: l.technicianId ?? undefined,
      })),
    };

    const completePayload = {
      idempotencyKey,
      allowNegativeStock: opts?.allowNegativeStock || undefined,
      payments: cart.payments.map(p => ({
        method: p.method === 'CHARGE' ? 'ACCOUNT' : p.method,
        amount: String(p.amount.toFixed(2)),
        reference: p.reference || undefined,
        notes: p.installmentTerm && p.installmentTerm !== 'STRAIGHT'
          ? `Installment: ${p.installmentTerm.replace('_', ' ')}`
          : undefined,
      })),
    };

    try {
      // Step 1: Create OPEN sale on server
      const createResult = await apiFetch<{ sale: any; lines: any[] }>('/sales', {
        method: 'POST',
        body: JSON.stringify(createPayload),
      });

      const saleId = createResult.sale.id;
      const saleNo = createResult.sale.saleNo || createResult.sale.sale_no;

      // Step 2: Complete sale with idempotency key
      setStatus('completing');

      // Store pending sale BEFORE attempting completion (crash safety)
      addPendingSale({
        idempotencyKey,
        saleId,
        payload: completePayload,
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastAttemptAt: null,
        status: 'pending',
      });

      const completed = await apiFetch<any>(`/sales/${saleId}/complete`, {
        method: 'POST',
        body: JSON.stringify(completePayload),
      });

      // Success — remove from pending queue
      removePendingSale(idempotencyKey);

      // Save receipt number for auto-increment
      if (cart.receiptNumber?.trim()) {
        storage.set(KEYS.LAST_RECEIPT_NUMBER, cart.receiptNumber.trim());
      }

      const checkoutResult: CheckoutResult = {
        saleId: completed.id || saleId,
        saleNo: completed.sale_no || completed.saleNo || saleNo,
        grandTotal: String(grandTotal.toFixed(2)),
      };

      setResult(checkoutResult);
      setStatus('success');
      return checkoutResult;
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Already processed — idempotency key collision, treat as success
          removePendingSale(idempotencyKey);
          setStatus('success');
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
              createdAt: new Date().toISOString(),
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
        setStatus('error');
        setError(err.message);
        return null;
      }
      // Unknown error
      setStatus('error');
      setError(err.message || 'Checkout failed');
      return null;
    }
  }, [cart, grandTotal]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  return { status, error, result, checkout, reset };
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
export async function reconcilePendingSales(): Promise<void> {
  const pending = getPendingSales();

  for (const sale of pending) {
    if (sale.status === 'reconciling') continue;

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
        continue;
      }

      if (!sale.saleId && sale.createPayload) {
        // Fully-offline sale: never created on server — replay full flow
        const createResult = await apiFetch<{ sale: any; lines: any[] }>('/sales', {
          method: 'POST',
          body: JSON.stringify(sale.createPayload),
        });

        const saleId = createResult.sale.id;

        // Now complete the sale
        await apiFetch<any>(`/sales/${saleId}/complete`, {
          method: 'POST',
          body: JSON.stringify(sale.payload),
        });

        removePendingSale(sale.idempotencyKey);
      } else if (sale.saleId) {
        // Partial-offline: sale was created but completion failed — retry completion
        await apiFetch<any>(`/sales/${sale.saleId}/complete`, {
          method: 'POST',
          body: JSON.stringify(sale.payload),
        });

        removePendingSale(sale.idempotencyKey);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        // Race condition — already processed between check and retry
        removePendingSale(sale.idempotencyKey);
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // Business error — flag for manual review, don't retry
        updatePendingSale(sale.idempotencyKey, { status: 'failed' });
      } else {
        // Network still down — leave as pending for next reconciliation attempt
        updatePendingSale(sale.idempotencyKey, { status: 'pending' });
      }
    }
  }
}
