"use client";

import { AlertTriangle } from "lucide-react";
import { fmtPeso } from "@/lib/format";

interface ConfirmPaymentDialogProps {
  open: boolean;
  dvNumber: string;
  supplierName: string;
  amount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmPaymentDialog({
  open,
  dvNumber,
  supplierName,
  amount,
  onClose,
  onConfirm,
}: ConfirmPaymentDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-amber-600">
          <AlertTriangle size={18} />
          <h2 className="text-lg font-semibold text-foreground">Confirm Supplier Payment</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">DV:</span>{" "}
            <span className="font-mono font-semibold">{dvNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Supplier:</span>{" "}
            <span className="font-medium">{supplierName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Amount:</span>{" "}
            <span className="font-semibold tabular-nums">{fmtPeso(amount)}</span>
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This releases cash and marks all linked supplier invoices as paid.
            Confirm only after the payment reference has been checked.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}
