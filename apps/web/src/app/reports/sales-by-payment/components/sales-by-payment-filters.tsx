import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import type { SalesByPaymentController } from "../types";

type SalesByPaymentFiltersProps = {
  controller: SalesByPaymentController;
};

const PRESETS = ["today", "week", "30d", "month"];

export function SalesByPaymentFilters({ controller }: SalesByPaymentFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => controller.applyPreset(preset)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            controller.activePreset === preset
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          {preset === "today" ? "Today" : preset === "week" ? "7 Days" : preset === "30d" ? "30 Days" : "Month"}
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
