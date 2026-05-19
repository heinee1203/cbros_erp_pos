import { Download, Search, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import type { DemandByTagController } from "../types";
import { TAG_TYPE_TABS } from "../utils";

type DemandByTagFiltersProps = {
  controller: DemandByTagController;
};

export function DemandByTagFilters({ controller }: DemandByTagFiltersProps) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TAG_TYPE_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => controller.setTagTypeFilterOption(tab.key)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors",
                controller.tagTypeFilter === tab.key
                  ? "border-primary/20 bg-primary/[0.04] text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
        <div className="h-4 w-px bg-border" />
        <DateRangePicker
          startDate={controller.dateFrom}
          endDate={controller.dateTo}
          onChange={controller.setDateRange}
        />
        {(controller.dateFrom || controller.dateTo) && (
          <button
            onClick={controller.clearDates}
            className="h-8 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear
          </button>
        )}
        {controller.rows.length > 0 && (
          <button
            onClick={controller.exportCsv}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download size={12} />
            Export CSV
          </button>
        )}
      </div>

      {controller.tagTypeFilter === "TIRE_SIZE" && controller.rimSizes.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rim:</span>
          {controller.rimSizes.map((size) => (
            <button
              key={size}
              onClick={() => controller.setRimSizeFilter(size)}
              className={cn(
                "h-6 rounded-full px-2.5 text-[11px] font-medium transition-colors",
                controller.rimSizeFilter === size
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={controller.search}
          onChange={(event) => controller.setSearch(event.target.value)}
          placeholder="Search applications..."
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        />
        {controller.search && (
          <button
            onClick={() => controller.setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </>
  );
}
