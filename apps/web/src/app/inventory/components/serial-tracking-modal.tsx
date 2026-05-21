"use client";

import { useState } from "react";
import { ModalShell } from "./modal-shell";

interface SerialTrackingModalProps {
  count: number;
  onClose: () => void;
  onApply: (updates: Record<string, unknown>) => Promise<void>;
}

export function SerialTrackingModal({
  count,
  onClose,
  onApply,
}: SerialTrackingModalProps) {
  const [trackingType, setTrackingType] = useState<"none" | "serial" | "dot">("none");
  const [warrantyMonths, setWarrantyMonths] = useState<number | null>(12);
  const [maxTireAgeYears, setMaxTireAgeYears] = useState<number | null>(5);
  const [applying, setApplying] = useState(false);

  async function handleApply() {
    setApplying(true);
    try {
      const updates: Record<string, unknown> = {
        isSerialized: trackingType === "serial",
        isTire: trackingType === "dot",
      };
      if (trackingType === "serial") {
        updates.warrantyMonths = warrantyMonths;
        updates.maxTireAgeYears = null;
      } else if (trackingType === "dot") {
        updates.warrantyMonths = null;
        updates.maxTireAgeYears = maxTireAgeYears;
      } else {
        updates.warrantyMonths = null;
        updates.maxTireAgeYears = null;
      }
      await onApply(updates);
    } catch {
      // Parent owns failure handling.
    }
    setApplying(false);
  }

  return (
    <ModalShell title="Set Item Tracking" onClose={onClose}>
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm" onClick={() => setTrackingType("none")}>
          <input type="radio" name="bulkTrackingType" checked={trackingType === "none"} readOnly className="accent-primary" />
          <span>No tracking</span>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm" onClick={() => setTrackingType("serial")}>
          <input type="radio" name="bulkTrackingType" checked={trackingType === "serial"} readOnly className="accent-primary" />
          <span>Serial Numbers <span className="text-xs text-muted-foreground">(batteries, alternators)</span></span>
        </label>
        {trackingType === "serial" && (
          <div className="ml-6">
            <label className="text-xs font-medium text-muted-foreground">Warranty Period (months)</label>
            <input
              type="number"
              min="0"
              max="120"
              value={warrantyMonths ?? ""}
              onChange={(e) => setWarrantyMonths(e.target.value ? parseInt(e.target.value) : null)}
              className="mt-1 block w-24 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              placeholder="e.g. 12"
            />
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm" onClick={() => setTrackingType("dot")}>
          <input type="radio" name="bulkTrackingType" checked={trackingType === "dot"} readOnly className="accent-primary" />
          <span>DOT Batch Tracking <span className="text-xs text-muted-foreground">(tires)</span></span>
        </label>
        {trackingType === "dot" && (
          <div className="ml-6">
            <label className="text-xs font-medium text-muted-foreground">Max Tire Age (years)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={maxTireAgeYears ?? ""}
              onChange={(e) => setMaxTireAgeYears(e.target.value ? parseInt(e.target.value) : null)}
              className="mt-1 block w-24 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              placeholder="e.g. 5"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
            Cancel
          </button>
          <button onClick={handleApply} disabled={applying} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {applying ? "Applying..." : `Apply to ${count} item${count !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
