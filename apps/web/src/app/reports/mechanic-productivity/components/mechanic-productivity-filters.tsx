import { Download } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { MechanicProductivityController } from "../types";

type MechanicProductivityFiltersProps = {
  controller: MechanicProductivityController;
};

export function MechanicProductivityFilters({ controller }: MechanicProductivityFiltersProps) {
  return (
    <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          startDate={controller.dateFrom}
          endDate={controller.dateTo}
          onChange={controller.setDateRange}
        />
        {controller.sorted.length > 0 && (
          <button
            onClick={controller.exportCsv}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download size={12} /> Export Commission Report
          </button>
        )}
      </div>
    </div>
  );
}
