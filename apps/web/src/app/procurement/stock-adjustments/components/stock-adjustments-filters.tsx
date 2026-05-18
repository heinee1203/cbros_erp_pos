import { Search, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ALL_REASON_CODES, REASON_CODE_LABELS } from "../constants";
import type { StockAdjustmentsController } from "../lib/use-stock-adjustments-controller";
import { FilterSelect } from "./filter-select";

type StockAdjustmentsFiltersProps = {
  controller: StockAdjustmentsController;
};

export function StockAdjustmentsFilters({ controller }: StockAdjustmentsFiltersProps) {
  return (
    <div className="border-b border-border bg-background/50 px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => controller.setAllLocations(!controller.allLocations)}
          className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
            controller.allLocations
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {controller.allLocations ? "All Locations" : "Current Location"}
        </button>

        <FilterSelect
          value={controller.directionFilter}
          onChange={(value) => controller.setDirectionFilter(value as "all" | "IN" | "OUT")}
          options={[
            { value: "all", label: "All Directions" },
            { value: "IN", label: "Additions" },
            { value: "OUT", label: "Deductions" },
          ]}
        />

        <FilterSelect
          value={controller.reasonFilter}
          onChange={controller.setReasonFilter}
          options={[
            { value: "all", label: "All Reasons" },
            ...ALL_REASON_CODES.map((code) => ({
              value: code,
              label: REASON_CODE_LABELS[code] ?? code,
            })),
          ]}
        />

        <DateRangePicker
          startDate={controller.dateFrom}
          endDate={controller.dateTo}
          onChange={controller.setDateRange}
        />

        <div className="relative ml-auto">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={controller.searchQuery}
            onChange={(event) => controller.handleSearchChange(event.target.value)}
            placeholder="Search product, SKU..."
            className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {controller.hasActiveFilters && (
          <button
            onClick={controller.clearFilters}
            className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
