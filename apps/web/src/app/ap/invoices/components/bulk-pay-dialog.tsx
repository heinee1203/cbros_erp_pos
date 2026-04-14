"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { fmtPeso } from "@/lib/format";

export function BulkPayDialog({
  open,
  onClose,
  onSuccess,
  invoiceCount,
  totalAmount,
  invoiceIds,
  token,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  invoiceCount: number;
  totalAmount: number;
  invoiceIds: string[];
  token: string;
  locationId: string;
}) {
  const [useInvoiceDate, setUseInvoiceDate] = useState(true);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    successCount: number;
    skippedCount: number;
    totalAmountPaid: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setUseInvoiceDate(true);
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setPaymentMethod("Cash");
      setReferenceNumber("");
      setNotes("");
      setError(null);
      setResult(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{
        successCount: number;
        skippedCount: number;
        skippedIds: string[];
        totalAmountPaid: number;
      }>("/ap/invoices/bulk-pay", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({
          invoiceIds,
          useInvoiceDateAsPaymentDate: useInvoiceDate,
          paymentDate: useInvoiceDate ? undefined : paymentDate,
          paymentMethod: paymentMethod || undefined,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
        }),
      });
      setResult(res);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to mark invoices as paid";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mark as Paid</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        {result ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-sm font-semibold text-emerald-700">
              {result.successCount} invoice{result.successCount !== 1 ? "s" : ""} marked as paid
            </p>
            <p className="mt-1 text-xs text-emerald-600">
              Total: {fmtPeso(result.totalAmountPaid)}
              {result.skippedCount > 0 &&
                ` \u00b7 ${result.skippedCount} skipped`}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
              <p className="text-sm">
                Mark{" "}
                <span className="font-semibold">{invoiceCount}</span>{" "}
                invoice{invoiceCount !== 1 ? "s" : ""} as fully paid
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {fmtPeso(totalAmount)}
              </p>
            </div>

            {error && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useInvoiceDate}
                  onChange={(e) => setUseInvoiceDate(e.target.checked)}
                  className="rounded border-border"
                />
                <span>
                  Use each invoice&apos;s own date as payment date
                </span>
              </label>

              {!useInvoiceDate && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="GCash">GCash</option>
                  <option value="Check">Check</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Reference # (optional)
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Receipt #, transfer ref, etc."
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? "Processing\u2026" : "Confirm Payment"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
