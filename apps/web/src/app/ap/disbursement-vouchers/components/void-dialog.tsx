"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface VoidDialogProps {
  open: boolean;
  dvNumber: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function VoidDialog({ open, dvNumber, onClose, onConfirm }: VoidDialogProps) {
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");

  useEffect(() => {
    if (open) { setReason(""); setPreset(""); }
  }, [open]);

  const finalReason = preset === "Other" || !preset ? reason : preset;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <AlertTriangle size={18} />
          <h2 className="text-lg font-semibold">Void Disbursement Voucher</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          This will reverse the payment and restore the SOA balance for{" "}
          <span className="font-semibold text-foreground">{dvNumber}</span>. This action cannot be undone.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Reason</label>
            <select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                if (e.target.value && e.target.value !== "Other") setReason(e.target.value);
              }}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none"
            >
              <option value="">Select a reason...</option>
              <option value="Incorrect amount">Incorrect amount</option>
              <option value="Wrong supplier">Wrong supplier</option>
              <option value="Duplicate payment">Duplicate payment</option>
              <option value="Check bounced">Check bounced</option>
              <option value="Other">Other (type below)</option>
            </select>
          </div>
          {(preset === "Other" || !preset) && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {preset === "Other" ? "Specify reason" : "Or type a reason"}
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this voucher being voided?"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button
            onClick={() => { if (finalReason.trim()) onConfirm(finalReason.trim()); }}
            disabled={!finalReason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Confirm Void
          </button>
        </div>
      </div>
    </div>
  );
}
