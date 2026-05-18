"use client";

import Link from "next/link";

interface PurchaseOrderActionBarProps {
  canSave: boolean;
  submitting: boolean;
  submitAction: "draft" | "submit" | null;
  onSave: (action: "draft" | "submit") => void;
}

export function PurchaseOrderActionBar({
  canSave,
  submitting,
  submitAction,
  onSave,
}: PurchaseOrderActionBarProps) {
  return (
    <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background px-4 py-3">
      <Link
        href="/procurement/purchase-orders"
        className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        Cancel
      </Link>
      <button
        type="button"
        onClick={() => onSave("draft")}
        disabled={!canSave || submitting}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
      >
        {submitting && submitAction === "draft" ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
            Saving...
          </span>
        ) : (
          "Save as Draft"
        )}
      </button>
      <button
        type="button"
        onClick={() => onSave("submit")}
        disabled={!canSave || submitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        {submitting && submitAction === "submit" ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Submitting...
          </span>
        ) : (
          "Submit PO"
        )}
      </button>
    </div>
  );
}
