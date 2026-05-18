"use client";

import { Scale, X } from "lucide-react";

import type { LocationInfo } from "@/app/auth-context";
import { useNewAdjustmentForm } from "../lib/use-new-adjustment-form";
import { AdjustmentDirectionField } from "./adjustment-direction-field";
import { AdjustmentLocationField } from "./adjustment-location-field";
import { AdjustmentNotesField } from "./adjustment-notes-field";
import { AdjustmentProductField } from "./adjustment-product-field";
import { AdjustmentQuantityField } from "./adjustment-quantity-field";
import { AdjustmentReasonField } from "./adjustment-reason-field";
import { AdjustmentStockCard } from "./adjustment-stock-card";
import { MutationStatusBanner } from "./mutation-status-banner";
import { NewAdjustmentDrawerFooter } from "./new-adjustment-drawer-footer";

type NewAdjustmentDrawerProps = {
  token: string;
  locationId: string;
  locations: LocationInfo[];
  onClose: () => void;
};

export function NewAdjustmentDrawer({
  token,
  locationId,
  locations,
  onClose,
}: NewAdjustmentDrawerProps) {
  const form = useNewAdjustmentForm({ locationId, onClose, token });
  const selectedProduct = form.selectedProduct;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-[2px]"
        onClick={form.isSubmitting ? undefined : onClose}
      />

      <div className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Scale size={16} className="text-muted-foreground" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              New Adjustment
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={form.isSubmitting}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={form.handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-5 px-5 py-5">
            <AdjustmentLocationField
              disabled={form.isSubmitting}
              locations={locations}
              selectedLocation={form.selectedLocation}
              onLocationChange={form.setSelectedLocation}
            />

            <AdjustmentProductField
              debouncedProductSearch={form.debouncedProductSearch}
              disabled={form.isSubmitting}
              isLoading={form.productSearchQuery.isLoading}
              productResults={form.productResults}
              productSearch={form.productSearch}
              selectedProduct={selectedProduct}
              showProductDropdown={form.showProductDropdown}
              onClearProduct={form.clearProduct}
              onDropdownChange={form.setShowProductDropdown}
              onProductSearchChange={form.handleProductSearch}
              onSelectProduct={form.selectProduct}
            />

            {selectedProduct && <AdjustmentStockCard product={selectedProduct} />}

            <AdjustmentDirectionField
              direction={form.direction}
              disabled={form.isSubmitting}
              onDirectionChange={form.setDirection}
            />

            <AdjustmentQuantityField
              available={form.available}
              disabled={form.isSubmitting}
              quantity={form.quantity}
              showOverstockWarning={form.showOverstockWarning}
              onQuantityChange={form.setQuantity}
            />

            <AdjustmentReasonField
              availableReasonCodes={form.availableReasonCodes}
              direction={form.direction}
              disabled={form.isSubmitting}
              reasonCode={form.reasonCode}
              onReasonCodeChange={form.setReasonCode}
            />

            <AdjustmentNotesField
              disabled={form.isSubmitting}
              notes={form.notes}
              notesRequired={form.notesRequired}
              onNotesChange={form.setNotes}
            />

            {form.statusMessage && (
              <MutationStatusBanner
                status={form.status}
                message={form.statusMessage}
              />
            )}
          </div>

          <NewAdjustmentDrawerFooter
            direction={form.direction}
            isSubmitting={form.isSubmitting}
            isValid={form.isValid}
            onClose={onClose}
          />
        </form>
      </div>
    </>
  );
}
