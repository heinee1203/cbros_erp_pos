"use client";

import { useState, useMemo, useEffect } from "react";
import {
  AdjustmentReasonCode,
  POSITIVE_ONLY_REASON_CODES,
  NEGATIVE_ONLY_REASON_CODES,
  RESTRICTED_REASON_CODES,
} from "@apex/types";
import { useAdjustmentMutation, type AdjustmentMutationStatus } from "@/hooks/use-adjustment-mutation";
import { useAuth } from "@/app/auth-context";
import { ModalShell } from "./modal-shell";

export function AdjustModal({ productId, locationId, token, onClose }: { productId: string; locationId: string; token: string; onClose: () => void }) {
  const { locations } = useAuth();
  const currentLoc = locations.find((l) => l.id === locationId);
  const [direction, setDirection] = useState<"IN" | "OUT" | "">("");
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const { submit, status, statusMessage, isSubmitting, result, reset } = useAdjustmentMutation(token, locationId);

  const availableReasonCodes = useMemo(() => {
    if (direction === "IN") return [...POSITIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    if (direction === "OUT") return [...NEGATIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    return [];
  }, [direction]);

  useEffect(() => { setReasonCode(""); }, [direction]);

  const notesRequired = direction === "OUT" || RESTRICTED_REASON_CODES.includes(reasonCode as AdjustmentReasonCode);
  const isValid = direction !== "" && Number(quantity) >= 1 && reasonCode !== "" && (!notesRequired || notes.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    submit({ productId, locationId, quantity: Number(quantity), direction: direction as "IN" | "OUT", reasonCode: reasonCode as any, notes: notes.trim() || undefined });
  };

  useEffect(() => {
    if (status === "success" || status === "already_processed") {
      const timer = setTimeout(() => { reset(); onClose(); }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onClose]);

  const REASON_CODE_LABELS: Record<string, string> = {
    COUNT_GAIN: "Count Gain (Physical Count)", FOUND_STOCK: "Found Stock", OPENING_BALANCE: "Opening Balance",
    COUNT_LOSS: "Count Loss (Physical Count)", DAMAGE_IN_TRANSIT: "Damage \u2014 In Transit", DAMAGE_WAREHOUSE: "Damage \u2014 Warehouse",
    DAMAGE_SHOWROOM: "Damage \u2014 Showroom", WARRANTY_WRITE_OFF: "Warranty Write-Off", SHRINKAGE_MISSING: "Shrinkage / Missing",
    OBSOLETE_WRITE_OFF: "Obsolete Write-Off", TRANSFER_SHORTAGE_CONFIRMED: "Transfer Shortage (Confirmed)", DATA_CORRECTION: "Data Correction (Admin Only)",
  };

  return (
    <ModalShell title="Adjust Stock" onClose={isSubmitting ? undefined : onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{currentLoc?.name ?? "Current Location"}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Adjustment Type <span className="text-destructive">*</span></label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDirection("IN")} disabled={isSubmitting} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${direction === "IN" ? "border-success bg-success/10 text-success" : "border-border hover:bg-accent"}`}>+ Add Stock</button>
            <button type="button" onClick={() => setDirection("OUT")} disabled={isSubmitting} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${direction === "OUT" ? "border-destructive bg-destructive/10 text-destructive" : "border-border hover:bg-accent"}`}>&minus; Remove Stock</button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Quantity <span className="text-destructive">*</span></label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter adjustment quantity" disabled={isSubmitting} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Reason <span className="text-destructive">*</span></label>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} disabled={isSubmitting || direction === ""} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50" required>
            <option value="">{direction === "" ? "Select direction first..." : "Select reason..."}</option>
            {availableReasonCodes.map((code) => <option key={code} value={code}>{REASON_CODE_LABELS[code] ?? code}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Notes {notesRequired ? <span className="text-destructive">* required</span> : <span className="text-muted-foreground">(optional)</span>}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={notesRequired ? "Notes are required for this adjustment type..." : "Optional adjustment notes..."} rows={2} disabled={isSubmitting} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50" />
        </div>
        {statusMessage && <MutationStatusBanner status={status} message={statusMessage} />}
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={!isValid || isSubmitting} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${direction === "OUT" ? "bg-destructive text-white hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
            {isSubmitting ? <span className="flex items-center justify-center gap-2"><Spinner />Processing...</span> : direction === "OUT" ? "Confirm Removal" : "Confirm Adjustment"}
          </button>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}

function MutationStatusBanner({ status, message }: { status: AdjustmentMutationStatus; message: string }) {
  const styles: Record<string, string> = { submitting: "bg-primary/5 border-primary/20 text-primary", success: "bg-success/10 border-success/20 text-success", already_processed: "bg-warning/10 border-warning/20 text-warning", contention_retry: "bg-warning/10 border-warning/20 text-warning", needs_reconcile: "bg-destructive/10 border-destructive/20 text-destructive", error: "bg-destructive/10 border-destructive/20 text-destructive" };
  const icons: Record<string, string> = { submitting: "\u23F3", success: "\u2713", already_processed: "\u21BB", contention_retry: "\u27F3", needs_reconcile: "\u26A0", error: "\u2715" };
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${styles[status] ?? ""}`}>
      <span className="shrink-0 text-sm">{icons[status] ?? ""}</span>
      <span>{message}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
