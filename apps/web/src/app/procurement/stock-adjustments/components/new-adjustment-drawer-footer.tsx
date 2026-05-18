import type { AdjustmentDirection } from "../lib/use-new-adjustment-form";
import { Spinner } from "./spinner";

type NewAdjustmentDrawerFooterProps = {
  direction: AdjustmentDirection;
  isSubmitting: boolean;
  isValid: boolean;
  onClose: () => void;
};

export function NewAdjustmentDrawerFooter({
  direction,
  isSubmitting,
  isValid,
  onClose,
}: NewAdjustmentDrawerFooterProps) {
  return (
    <div className="border-t border-border px-5 py-4">
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
            direction === "OUT"
              ? "bg-destructive text-white hover:bg-destructive/90"
              : "bg-foreground text-background hover:bg-foreground/90"
          }`}
        >
          {isSubmitting ? (
            <>
              <Spinner />
              Processing...
            </>
          ) : direction === "OUT" ? (
            "Confirm Removal"
          ) : (
            "Confirm Adjustment"
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="flex-1 rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
