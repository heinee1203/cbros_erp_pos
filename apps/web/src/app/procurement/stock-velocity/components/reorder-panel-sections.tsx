import { AlertTriangle, Check, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import type { CreatedReorderPO, ReorderSupplierGroup } from "../types";
import { fmtPeso } from "../utils";

type LocationOption = {
  id: string;
  name: string;
  isActive?: boolean;
  type?: string | null;
};

export function ReorderPanelHeader({
  inline,
  onClose,
}: {
  inline?: boolean;
  onClose: () => void;
}) {
  if (inline) return null;

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <ShoppingCart size={16} className="text-primary" />
        <h2 className="text-sm font-semibold">Reorder Suggestions</h2>
      </div>
      <button onClick={onClose} className="rounded p-1 hover:bg-muted">
        <X size={16} />
      </button>
    </div>
  );
}

export function ReorderPanelFilters({
  allLocations,
  brandId,
  brandName,
  categoryId,
  categoryName,
  destinationLocationId,
  itemCount,
  targetMonths,
  urgency,
  onDestinationLocationChange,
  onTargetMonthsChange,
  onUrgencyChange,
}: {
  allLocations: LocationOption[];
  brandId?: string;
  brandName?: string | null;
  categoryId?: string;
  categoryName?: string | null;
  destinationLocationId: string;
  itemCount: number;
  targetMonths: number;
  urgency: string;
  onDestinationLocationChange: (value: string) => void;
  onTargetMonthsChange: (value: number) => void;
  onUrgencyChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <label className="text-[10px] text-muted-foreground">Target:</label>
      <select
        value={targetMonths}
        onChange={(event) => onTargetMonthsChange(+event.target.value)}
        className="h-6 rounded border border-border bg-background px-1.5 text-[11px]"
      >
        <option value={1}>1 month</option>
        <option value={2}>2 months</option>
        <option value={3}>3 months</option>
        <option value={6}>6 months</option>
      </select>
      <select
        value={urgency}
        onChange={(event) => onUrgencyChange(event.target.value)}
        className="h-6 rounded border border-border bg-background px-1.5 text-[11px]"
      >
        <option value="">All Urgency</option>
        <option value="critical">Critical</option>
        <option value="warning">Warning</option>
        <option value="monitor">Monitor</option>
      </select>
      {(brandId || categoryId) && (
        <span
          className="flex items-center gap-1 rounded border border-dashed border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
          title="Set at the page header - change Brand/Category above to update the panel"
        >
          <span className="font-medium text-muted-foreground/80">Global:</span>
          {brandId && (
            <span className="rounded bg-background px-1.5 py-px font-medium text-foreground">
              {brandName || "Brand"}
            </span>
          )}
          {categoryId && (
            <span className="rounded bg-background px-1.5 py-px font-medium text-foreground">
              {categoryName || "Category"}
            </span>
          )}
        </span>
      )}
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-muted-foreground">Deliver to:</label>
        <select
          value={destinationLocationId}
          onChange={(event) => onDestinationLocationChange(event.target.value)}
          className="h-6 rounded border border-border bg-background px-1.5 text-[11px]"
        >
          {allLocations
            .filter(
              (location) =>
                location.isActive !== false &&
                location.type !== "TRANSIT_BUFFER",
            )
            .map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
        </select>
      </div>
      <span className="ml-auto text-[10px] text-muted-foreground">
        {itemCount} items
      </span>
    </div>
  );
}

export function ReorderSuccessState({
  createdPOs,
  onClose,
}: {
  createdPOs: CreatedReorderPO[];
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <Check size={24} className="text-green-600" />
      </div>
      <h3 className="font-semibold">Reorder Items Processed</h3>
      {createdPOs.map((po) => (
        <div key={po.poNo} className="text-sm text-muted-foreground">
          <span className="font-mono font-medium text-primary">{po.poNo}</span>
          {" - "}
          {po.supplierName} ({po.itemCount} items)
          <span
            className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              po.action === "updated"
                ? "bg-blue-100 text-blue-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {po.action === "updated" ? "Merged" : "Created"}
          </span>
        </div>
      ))}
      <button
        onClick={onClose}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Close
      </button>
    </div>
  );
}

export function ReorderActionFooter({
  allItemCount,
  creating,
  estTotal,
  hasAllCosts,
  itemCount,
  panelSearch,
  selectedCount,
  showCost,
  supplierGroups,
  totalSelectedCount,
  onClose,
  onCreatePOs,
  onShowSupplierModal,
}: {
  allItemCount: number;
  creating: boolean;
  estTotal: number;
  hasAllCosts: boolean;
  itemCount: number;
  panelSearch: string;
  selectedCount: number;
  showCost: boolean;
  supplierGroups: ReorderSupplierGroup[];
  totalSelectedCount: number;
  onClose: () => void;
  onCreatePOs: () => void;
  onShowSupplierModal: () => void;
}) {
  const confirm = useConfirm();
  const supplierGroupCount = supplierGroups.filter((group) => group.supplierId)
    .length;

  return (
    <div
      className={cn(
        "flex items-center justify-between border-t px-4 transition-all",
        selectedCount > 0
          ? "border-primary/30 bg-primary/5 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)]"
          : "border-border bg-muted/40 py-1.5",
      )}
    >
      <div
        className={cn(
          selectedCount > 0 ? "text-sm" : "text-xs text-muted-foreground",
        )}
      >
        {selectedCount > 0 ? (
          <>
            <span className="font-semibold text-foreground">
              {totalSelectedCount}
            </span>
            <span className="text-muted-foreground">
              {" "}
              {totalSelectedCount === 1 ? "item" : "items"} selected
            </span>
            {panelSearch && (
              <span className="text-muted-foreground/80">
                {" "}
                (showing {itemCount} of {allItemCount})
              </span>
            )}
            {showCost && estTotal > 0 && (
              <span className="ml-3 text-muted-foreground">
                Est. Total:{" "}
                <span className="font-semibold text-foreground">
                  {fmtPeso(estTotal)}
                </span>
                {!hasAllCosts && (
                  <span className="ml-1 text-[11px]">(partial)</span>
                )}
              </span>
            )}
          </>
        ) : (
          <>
            Selected:{" "}
            <span className="font-semibold text-foreground">
              {totalSelectedCount}
            </span>{" "}
            items
            {panelSearch && ` (showing ${itemCount} of ${allItemCount})`}
            {showCost && estTotal > 0 && (
              <span className="ml-3">
                Est. Total:{" "}
                <span className="font-semibold text-foreground">
                  {fmtPeso(estTotal)}
                </span>
                {!hasAllCosts && " (partial)"}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            const noSupplierGroup = supplierGroups.find(
              (group) => !group.supplierId,
            );
            const hasSupplierGroups = supplierGroups.filter(
              (group) => group.supplierId,
            );

            if (hasSupplierGroups.length === 0) {
              toast.error(
                `Assign a supplier before creating a PO for these ${selectedCount} items.`,
              );
              return;
            }

            if (noSupplierGroup && noSupplierGroup.items.length > 0) {
              const assignedCount = hasSupplierGroups.reduce(
                (sum, group) => sum + group.items.length,
                0,
              );
              const proceed = await confirm({
                title: "Skip items without supplier?",
                message: `${noSupplierGroup.items.length} items have no supplier and will be skipped. Create PO(s) for the ${assignedCount} items that have suppliers?`,
                confirmLabel: "Create PO(s)",
                cancelLabel: "Review Suppliers",
                variant: "warning",
              });
              if (!proceed) return;
            }

            if (hasSupplierGroups.length > 1) {
              onShowSupplierModal();
            } else {
              onCreatePOs();
            }
          }}
          disabled={selectedCount === 0 || creating}
          className={cn(
            "flex items-center gap-1.5 rounded-md bg-primary font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50",
            selectedCount > 0
              ? "px-5 py-2 text-sm shadow-sm ring-1 ring-primary/20"
              : "px-3 py-1.5 text-xs",
          )}
        >
          <ShoppingCart size={selectedCount > 0 ? 14 : 12} />
          {creating
            ? "Creating..."
            : `Create Draft PO${supplierGroupCount > 1 ? `s (${supplierGroupCount})` : ""}`}
        </button>
      </div>
    </div>
  );
}

export function SupplierGroupingModal({
  creating,
  supplierGroups,
  onClose,
  onCreatePOs,
}: {
  creating: boolean;
  supplierGroups: ReorderSupplierGroup[];
  onClose: () => void;
  onCreatePOs: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-background p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold">
          Items span multiple suppliers
        </h3>
        <div className="space-y-2">
          {supplierGroups.map((group, index) => (
            <div
              key={group.supplierId || index}
              className="rounded-md border border-border p-3"
            >
              <div className="text-sm font-medium">{group.supplierName}</div>
              <div className="text-xs text-muted-foreground">
                {group.items.length} items
              </div>
              {!group.supplierId && (
                <div className="mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} className="text-warning" />
                  <span className="text-[10px] text-warning">
                    No supplier - PO will be skipped
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onCreatePOs}
            disabled={creating}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating
              ? "Creating..."
              : `Create ${supplierGroups.filter((group) => group.supplierId).length} Draft POs`}
          </button>
        </div>
      </div>
    </div>
  );
}
