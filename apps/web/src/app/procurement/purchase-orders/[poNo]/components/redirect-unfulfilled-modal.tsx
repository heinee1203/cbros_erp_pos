import { Loader2, X } from "lucide-react";

type RedirectUnfulfilledModalProps = {
  redirectPlan: any;
  redirectLoading: boolean;
  redirectError: string | null;
  redirectSelections: Record<string, string>;
  redirectCreating: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelectionChange: (lineId: string, supplierId: string) => void;
};

export function RedirectUnfulfilledModal({
  redirectPlan,
  redirectLoading,
  redirectError,
  redirectSelections,
  redirectCreating,
  onClose,
  onCreate,
  onSelectionChange,
}: RedirectUnfulfilledModalProps) {
  const selectedCount = Object.values(redirectSelections).filter((value) => value !== "skip").length;
  const itemCount = (redirectPlan?.items ?? []).length;
  const allSkipped = Object.values(redirectSelections).every((value) => value === "skip");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Redirect Unfulfilled Items</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X size={14} />
          </button>
        </div>

        {redirectLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading redirect plan...</span>
          </div>
        )}

        {redirectError && (
          <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {redirectError}
          </div>
        )}

        {redirectPlan && !redirectLoading && (
          <>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto">
              {(redirectPlan.items ?? []).map((item: any) => (
                <div key={item.lineId} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{item.productName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">SKU: {item.sku}</span>
                    </div>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {item.unfulfilledQty} unfulfilled
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`redirect-${item.lineId}`}
                        value="skip"
                        checked={redirectSelections[item.lineId] === "skip"}
                        onChange={() => onSelectionChange(item.lineId, "skip")}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs text-muted-foreground">Skip (do not redirect)</span>
                    </label>
                    {(item.alternateSuppliers ?? []).map((alternate: any) => (
                      <label key={alternate.supplierId} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`redirect-${item.lineId}`}
                          value={alternate.supplierId}
                          checked={redirectSelections[item.lineId] === alternate.supplierId}
                          onChange={() => onSelectionChange(item.lineId, alternate.supplierId)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs">
                          {alternate.supplierName}
                          {alternate.cost && (
                            <span className="ml-1 text-muted-foreground">
                              (&#8369;{parseFloat(alternate.cost).toLocaleString()})
                            </span>
                          )}
                          {alternate.leadTimeDays && (
                            <span className="ml-1 text-muted-foreground">{alternate.leadTimeDays}d lead</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {selectedCount} of {itemCount} items selected for redirect
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={onCreate}
                disabled={redirectCreating || allSkipped}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
              >
                {redirectCreating && <Loader2 size={12} className="animate-spin" />}
                Create Redirect PO(s)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
