import { AlertTriangle } from "lucide-react";

type AdjustmentQuantityFieldProps = {
  available: number;
  disabled: boolean;
  quantity: string;
  showOverstockWarning: boolean;
  onQuantityChange: (value: string) => void;
};

export function AdjustmentQuantityField({
  available,
  disabled,
  quantity,
  showOverstockWarning,
  onQuantityChange,
}: AdjustmentQuantityFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Quantity <span className="text-destructive">*</span>
      </label>
      <input
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => onQuantityChange(e.target.value)}
        placeholder="Enter adjustment quantity"
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
      />
      {showOverstockWarning && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
          <AlertTriangle size={11} />
          Quantity exceeds available stock ({available} available)
        </p>
      )}
    </div>
  );
}
