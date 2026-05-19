import { Download, Search, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { SalesByItemController } from "../types";

type SalesByItemFiltersProps = {
  controller: SalesByItemController;
};

export function SalesByItemFilters({ controller }: SalesByItemFiltersProps) {
  return (
    <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={controller.search}
            onChange={(event) => controller.setSearchFilter(event.target.value)}
            placeholder="Search by name, SKU, or barcode..."
            className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
          {controller.search && (
            <button
              onClick={() => controller.setSearchFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <select
          value={controller.categoryFilter}
          onChange={(event) => controller.setCategoryFilterValue(event.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium text-foreground outline-none"
        >
          <option value="">All Categories</option>
          {controller.categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <DateRangePicker
          startDate={controller.dateFrom}
          endDate={controller.dateTo}
          onChange={controller.setDateRange}
        />

        {controller.hasActiveFilters && (
          <button
            onClick={controller.resetFilters}
            className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Reset
          </button>
        )}

        {controller.filtered.length > 0 && (
          <button
            onClick={controller.exportCsv}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download size={12} />
            Export CSV
          </button>
        )}
      </div>
    </div>
  );
}
