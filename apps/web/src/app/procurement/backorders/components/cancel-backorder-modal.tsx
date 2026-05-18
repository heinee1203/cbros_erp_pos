"use client";

import { Loader2 } from "lucide-react";

import type { BackorderItem } from "../types";
import { ModalOverlay } from "./modal-overlay";

interface CancelBackorderModalProps {
  item: BackorderItem;
  reason: string;
  loading: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function CancelBackorderModal({
  item,
  reason,
  loading,
  onReasonChange,
  onClose,
  onConfirm,
}: CancelBackorderModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-md">
        <h3 className="text-base font-semibold text-foreground mb-1">
          Cancel Backorder
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Cancel backorder for{" "}
          <span className="font-medium text-foreground">
            {item.productName}
          </span>
          ?
        </p>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Reason for cancellation
        </label>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Enter reason..."
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep Active
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            Cancel Backorder
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
