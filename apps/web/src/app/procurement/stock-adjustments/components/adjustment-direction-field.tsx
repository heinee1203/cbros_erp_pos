import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";

import type { AdjustmentDirection } from "../lib/use-new-adjustment-form";

type AdjustmentDirectionFieldProps = {
  direction: AdjustmentDirection;
  disabled: boolean;
  onDirectionChange: (value: AdjustmentDirection) => void;
};

export function AdjustmentDirectionField({
  direction,
  disabled,
  onDirectionChange,
}: AdjustmentDirectionFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Adjustment Type <span className="text-destructive">*</span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDirectionChange("IN")}
          disabled={disabled}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            direction === "IN"
              ? "border-success bg-success/10 text-success"
              : "border-border text-foreground hover:bg-accent"
          } disabled:opacity-50`}
        >
          <ArrowUpCircle size={15} />
          Add Stock
        </button>
        <button
          type="button"
          onClick={() => onDirectionChange("OUT")}
          disabled={disabled}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            direction === "OUT"
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border text-foreground hover:bg-accent"
          } disabled:opacity-50`}
        >
          <ArrowDownCircle size={15} />
          Remove Stock
        </button>
      </div>
    </div>
  );
}
