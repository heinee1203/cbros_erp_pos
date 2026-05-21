import type { ReactNode } from "react";
import { Download, Search, X } from "lucide-react";
import type { GroupByOption } from "@/hooks/use-inventory-valuation";
import { cn } from "@/lib/utils";
import type { InventoryValuationController } from "../types";

type InventoryValuationFiltersProps = {
  controller: InventoryValuationController;
};

const GROUP_OPTIONS: GroupByOption[] = ["category", "brand", "family", "location"];

export function InventoryValuationFilters({ controller }: InventoryValuationFiltersProps) {
  return (
    <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={controller.filterLocationId}
          onChange={(event) => controller.setFilterLocationId(event.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        >
          <option value="">All Locations</option>
          {controller.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>

        <select
          value={controller.filterCategoryId}
          onChange={(event) => controller.setFilterCategoryId(event.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        >
          <option value="">All Categories</option>
          {controller.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={controller.filterBrandId}
          onChange={(event) => controller.setFilterBrandId(event.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        >
          <option value="">All Brands</option>
          {controller.brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>

        {controller.hasFilters && (
          <button
            onClick={controller.resetFilters}
            className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <FilterToggle
          checked={controller.excludeZeroCost}
          onChange={controller.setExcludeZeroCost}
          label={<>Excl. {"\u20B1"}0 cost</>}
        />
        <FilterToggle
          checked={controller.excludeZeroSell}
          onChange={controller.setExcludeZeroSell}
          label={<>Excl. {"\u20B1"}0 sell</>}
        />
        <FilterToggle
          checked={controller.excludeUnassigned}
          onChange={controller.setExcludeUnassigned}
          label="Excl. unassigned"
        />

        <div className="mx-0.5 h-5 w-px bg-border" />

        <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => controller.setGroupByOption(option)}
              className={cn(
                "rounded-md px-3 py-1 text-[11px] font-semibold capitalize transition-colors",
                controller.groupBy === option
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="relative min-w-[140px] max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={controller.search}
            onChange={(event) => controller.setSearch(event.target.value)}
            placeholder={`Search ${controller.groupBy}...`}
            className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
          {controller.search && (
            <button
              onClick={() => controller.setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {controller.filtered.length > 0 && (
          <button
            onClick={controller.exportCsv}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download size={12} /> Export CSV
          </button>
        )}
      </div>
    </div>
  );
}

function FilterToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3 w-3 rounded accent-primary"
      />
      {label}
    </label>
  );
}
