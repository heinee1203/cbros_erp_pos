"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { LocationRow } from "@/hooks/use-locations";

interface AvailableForSaleModalProps {
  selectedIds: string[];
  locations: LocationRow[];
  token: string | null;
  locationId: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function AvailableForSaleModal({
  selectedIds,
  locations,
  token,
  locationId,
  onClose,
  onDone,
}: AvailableForSaleModalProps) {
  const [checkedLocs, setCheckedLocs] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<"set" | "add" | "remove">("set");
  const [saving, setSaving] = useState(false);

  const toggleLoc = (id: string) => {
    setCheckedLocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (checkedLocs.size === 0) return;
    setSaving(true);
    try {
      await apiFetch("/products/bulk-available-for-sale", {
        method: "PATCH",
        token: token!,
        locationId: locationId!,
        body: JSON.stringify({
          productIds: selectedIds,
          action,
          locationIds: Array.from(checkedLocs),
        }),
      });
      onDone();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold">Set Availability for {selectedIds.length} Items</h3>
        <p className="mb-3 text-[11px] text-muted-foreground">Choose which stores these items should be available for sale at</p>

        <div className="mb-3 space-y-1.5">
          {locations.map((loc) => (
            <label key={loc.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/50">
              <input type="checkbox" checked={checkedLocs.has(loc.id)} onChange={() => toggleLoc(loc.id)} />
              {loc.name}
            </label>
          ))}
        </div>

        <div className="mb-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Action:</p>
          <label className="flex items-start gap-2 text-xs">
            <input type="radio" checked={action === "set"} onChange={() => setAction("set")} className="mt-0.5" />
            <span><strong>Set</strong> - selected stores become available, unchecked stores become unavailable</span>
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input type="radio" checked={action === "add"} onChange={() => setAction("add")} className="mt-0.5" />
            <span><strong>Add</strong> - enable at selected stores, keep existing availability</span>
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input type="radio" checked={action === "remove"} onChange={() => setAction("remove")} className="mt-0.5" />
            <span><strong>Remove</strong> - disable at selected stores, keep others</span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
          <button
            onClick={handleApply}
            disabled={checkedLocs.size === 0 || saving}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
