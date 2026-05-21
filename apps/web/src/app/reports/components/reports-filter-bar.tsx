import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import type { EmployeeItem, LocationItem } from "@/hooks/use-sales-reports";
import type { ReportsDateRange, ReportsPreset } from "../types";
import { fmtRangeLabel } from "../utils";

type ReportsFilterBarProps = {
  range: ReportsDateRange;
  preset: ReportsPreset;
  customFrom: string;
  customTo: string;
  selectedLocation: string;
  selectedEmployee: string;
  currentLocationId: string;
  locations: LocationItem[];
  employees: EmployeeItem[];
  onNavigateRange: (direction: "prev" | "next") => void;
  onApplyPreset: (preset: ReportsPreset) => void;
  onCustomRangeChange: (start: string, end: string) => void;
  onSelectedLocationChange: (value: string) => void;
  onSelectedEmployeeChange: (value: string) => void;
};

const PRESETS: Array<[ReportsPreset, string]> = [
  ["today", "Today"],
  ["7d", "7 Days"],
  ["30d", "30 Days"],
  ["month", "This Month"],
  ["custom", "Custom"],
];

export function ReportsFilterBar({
  range,
  preset,
  customFrom,
  customTo,
  selectedLocation,
  selectedEmployee,
  currentLocationId,
  locations,
  employees,
  onNavigateRange,
  onApplyPreset,
  onCustomRangeChange,
  onSelectedLocationChange,
  onSelectedEmployeeChange,
}: ReportsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onNavigateRange("prev")}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[200px] text-center text-[13px] font-medium text-foreground">
          {fmtRangeLabel(range.from, range.to)}
        </span>
        <button
          onClick={() => onNavigateRange("next")}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="hidden h-5 w-px bg-border sm:block" />

      <div className="flex items-center gap-1">
        {PRESETS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => onApplyPreset(key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
              preset === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <>
          <div className="hidden h-5 w-px bg-border sm:block" />
          <DateRangePicker
            startDate={customFrom}
            endDate={customTo}
            onChange={onCustomRangeChange}
          />
        </>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <select
          value={selectedLocation || currentLocationId}
          onChange={(event) => onSelectedLocationChange(event.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground"
        >
          <option value="__all__">All Stores</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name} ({location.code})
            </option>
          ))}
        </select>

        <select
          value={selectedEmployee}
          onChange={(event) => onSelectedEmployeeChange(event.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground"
        >
          <option value="">All Employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
