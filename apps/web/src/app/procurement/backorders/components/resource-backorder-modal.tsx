"use client";

import { Loader2 } from "lucide-react";

import type { BackorderItem, SupplierOption } from "../types";
import { ModalOverlay } from "./modal-overlay";

interface ResourceBackorderModalProps {
  item: BackorderItem;
  supplierId: string;
  suppliers: SupplierOption[];
  loading: boolean;
  onSupplierChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function ResourceBackorderModal({
  item,
  supplierId,
  suppliers,
  loading,
  onSupplierChange,
  onClose,
  onConfirm,
}: ResourceBackorderModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-md">
        <h3 className="text-base font-semibold text-foreground mb-1">
          Re-source to Different Supplier
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Re-source{" "}
          <span className="font-medium text-foreground">
            {item.productName}
          </span>{" "}
          ({item.quantityOutstanding ?? item.qtyNeeded} pcs)
        </p>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          New Supplier
        </label>
        <select
          value={supplierId}
          onChange={(e) => onSupplierChange(e.target.value)}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm mb-4"
        >
          <option value="">Select supplier...</option>
          {suppliers
            .filter((supplier) => supplier.id !== item.supplierId)
            .map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!supplierId || loading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create PO & Re-source
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
