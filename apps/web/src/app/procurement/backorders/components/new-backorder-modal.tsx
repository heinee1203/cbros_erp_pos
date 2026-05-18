"use client";

import { Loader2 } from "lucide-react";

import type { ProductSearchResult, SupplierOption } from "../types";
import { ModalOverlay } from "./modal-overlay";
import { NewBackorderProductPicker } from "./new-backorder-product-picker";

interface NewBackorderModalProps {
  selectedProduct: ProductSearchResult | null;
  productSearch: string;
  productResults: ProductSearchResult[];
  productSearchLoading: boolean;
  suppliers: SupplierOption[];
  supplierId: string;
  qty: number;
  reason: string;
  priority: string;
  neededBy: string;
  loading: boolean;
  onClose: () => void;
  onProductSearchChange: (value: string) => void;
  onProductResultsChange: (value: ProductSearchResult[]) => void;
  onSelectedProductChange: (value: ProductSearchResult | null) => void;
  onSupplierChange: (value: string) => void;
  onQtyChange: (value: number) => void;
  onReasonChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onNeededByChange: (value: string) => void;
  onCreate: () => void;
}

export function NewBackorderModal({
  selectedProduct,
  productSearch,
  productResults,
  productSearchLoading,
  suppliers,
  supplierId,
  qty,
  reason,
  priority,
  neededBy,
  loading,
  onClose,
  onProductSearchChange,
  onProductResultsChange,
  onSelectedProductChange,
  onSupplierChange,
  onQtyChange,
  onReasonChange,
  onPriorityChange,
  onNeededByChange,
  onCreate,
}: NewBackorderModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-lg">
        <h3 className="text-base font-semibold text-foreground mb-1">
          New Backorder
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Manually create a backorder for an item that a supplier cannot
          currently fulfill.
        </p>

        <div className="space-y-3">
          <NewBackorderProductPicker
            productSearch={productSearch}
            productResults={productResults}
            productSearchLoading={productSearchLoading}
            selectedProduct={selectedProduct}
            onProductResultsChange={onProductResultsChange}
            onProductSearchChange={onProductSearchChange}
            onSelectedProductChange={onSelectedProductChange}
          />

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Supplier <span className="text-red-500">*</span>
            </label>
            <select
              value={supplierId}
              onChange={(e) => onSupplierChange(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => onQtyChange(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => onPriorityChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              >
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="e.g., Out of stock at supplier, Delayed shipment"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Needed By
            </label>
            <input
              type="date"
              value={neededBy}
              onChange={(e) => onNeededByChange(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={loading || !selectedProduct || !supplierId}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            Create Backorder
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
