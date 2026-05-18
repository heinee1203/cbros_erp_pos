import { Plus, Scale } from "lucide-react";
import { CAN_CREATE_ADJUSTMENTS } from "../constants";
import type { StockAdjustmentsController } from "../lib/use-stock-adjustments-controller";

type StockAdjustmentsHeaderProps = {
  controller: StockAdjustmentsController;
};

export function StockAdjustmentsHeader({ controller }: StockAdjustmentsHeaderProps) {
  return (
    <div className="border-b border-border bg-background px-6 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Scale size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Stock Adjustments</h1>
            <p className="text-xs text-muted-foreground">
              Record and audit inventory corrections across all locations
            </p>
          </div>
        </div>
        {CAN_CREATE_ADJUSTMENTS && (
          <button
            onClick={() => controller.setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            <Plus size={16} />
            New Adjustment
          </button>
        )}
      </div>
    </div>
  );
}
