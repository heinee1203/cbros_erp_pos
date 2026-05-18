import { ChevronDown } from "lucide-react";
import type { AdjustmentReasonCode } from "@apex/types";

import type { AdjustmentDirection } from "../lib/use-new-adjustment-form";
import { REASON_CODE_LABELS } from "../constants";

type AdjustmentReasonFieldProps = {
  availableReasonCodes: AdjustmentReasonCode[];
  direction: AdjustmentDirection;
  disabled: boolean;
  reasonCode: string;
  onReasonCodeChange: (value: string) => void;
};

export function AdjustmentReasonField({
  availableReasonCodes,
  direction,
  disabled,
  reasonCode,
  onReasonCodeChange,
}: AdjustmentReasonFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Reason <span className="text-destructive">*</span>
      </label>
      <div className="relative">
        <select
          value={reasonCode}
          onChange={(e) => onReasonCodeChange(e.target.value)}
          disabled={disabled || direction === ""}
          className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
        >
          <option value="">
            {direction === "" ? "Select direction first..." : "Select reason..."}
          </option>
          {availableReasonCodes.map((code) => (
            <option key={code} value={code}>
              {REASON_CODE_LABELS[code] ?? code}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}
