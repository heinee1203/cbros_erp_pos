import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import type { DiscountAnalysisController } from "../types";
import { DATE_PRESETS } from "../utils";

type DiscountAnalysisFiltersProps = {
  controller: DiscountAnalysisController;
};

export function DiscountAnalysisFilters({ controller }: DiscountAnalysisFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {DATE_PRESETS.map((preset) => (
        <button
          key={preset.key}
          onClick={() => controller.applyPreset(preset.key)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            controller.activePreset === preset.key
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          {preset.label}
        </button>
      ))}
      <DateRangePicker
        startDate={controller.dateFrom}
        endDate={controller.dateTo}
        onChange={controller.setDateRange}
      />
      {(controller.dateFrom || controller.dateTo) && (
        <button onClick={controller.clearDates} className="text-xs text-muted-foreground hover:text-foreground">
          Clear
        </button>
      )}
    </div>
  );
}
