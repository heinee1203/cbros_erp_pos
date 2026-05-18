"use client";

import type { Dispatch, SetStateAction } from "react";

import type { LocationRow } from "@/hooks/use-locations";
import type { SupplierRow } from "@/hooks/use-suppliers";

interface NewSupplierForm {
  name: string;
  mnemonicCode: string;
  contactEmail: string;
  contactPhone: string;
}

interface OrderDetailsCardProps {
  supplierId: string;
  suppliers: SupplierRow[];
  destinationId: string;
  locations: LocationRow[];
  expectedDelivery: string;
  notes: string;
  showNewSupplier: boolean;
  newSupplierForm: NewSupplierForm;
  supplierSaving: boolean;
  supplierError: string | null;
  onSupplierChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onExpectedDeliveryChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onShowNewSupplierChange: (value: boolean) => void;
  onNewSupplierFormChange: Dispatch<SetStateAction<NewSupplierForm>>;
  onSupplierErrorChange: (value: string | null) => void;
  onCreateSupplier: () => void;
}

export function OrderDetailsCard({
  supplierId,
  suppliers,
  destinationId,
  locations,
  expectedDelivery,
  notes,
  showNewSupplier,
  newSupplierForm,
  supplierSaving,
  supplierError,
  onSupplierChange,
  onDestinationChange,
  onExpectedDeliveryChange,
  onNotesChange,
  onShowNewSupplierChange,
  onNewSupplierFormChange,
  onSupplierErrorChange,
  onCreateSupplier,
}: OrderDetailsCardProps) {
  return (
    <div className="mb-4 rounded-lg border border-border bg-background p-4">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Order Details
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Supplier <span className="text-destructive">*</span>
          </label>
          <div className="flex items-center gap-2">
            <select
              value={supplierId}
              onChange={(e) => onSupplierChange(e.target.value)}
              className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="">Select a supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.mnemonicCode ? `[${s.mnemonicCode}] ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onShowNewSupplierChange(!showNewSupplier)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Add new supplier"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Destination <span className="text-destructive">*</span>
          </label>
          <select
            value={destinationId}
            onChange={(e) => onDestinationChange(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          >
            <option value="">Select destination...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Expected Delivery Date
          </label>
          <input
            type="date"
            value={expectedDelivery}
            onChange={(e) => onExpectedDeliveryChange(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Optional notes..."
            maxLength={1000}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </div>

      {showNewSupplier && (
        <div className="mt-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
          <h4 className="mb-2 text-xs font-semibold text-primary">New Supplier</h4>
          {supplierError && (
            <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
              {supplierError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Supplier name *"
              value={newSupplierForm.name}
              onChange={(e) =>
                onNewSupplierFormChange((f) => ({ ...f, name: e.target.value }))
              }
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <input
              type="text"
              placeholder="Code (2 chars)"
              value={newSupplierForm.mnemonicCode}
              onChange={(e) =>
                onNewSupplierFormChange((f) => ({
                  ...f,
                  mnemonicCode: e.target.value.toUpperCase().slice(0, 2),
                }))
              }
              maxLength={2}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <input
              type="email"
              placeholder="Email"
              value={newSupplierForm.contactEmail}
              onChange={(e) =>
                onNewSupplierFormChange((f) => ({ ...f, contactEmail: e.target.value }))
              }
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newSupplierForm.contactPhone}
              onChange={(e) =>
                onNewSupplierFormChange((f) => ({ ...f, contactPhone: e.target.value }))
              }
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateSupplier}
              disabled={!newSupplierForm.name.trim() || supplierSaving}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {supplierSaving ? "Saving..." : "Add & Select"}
            </button>
            <button
              type="button"
              onClick={() => {
                onShowNewSupplierChange(false);
                onSupplierErrorChange(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
