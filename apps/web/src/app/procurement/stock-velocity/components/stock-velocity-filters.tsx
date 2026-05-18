import { Search } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { VELOCITY_CLASSES } from "../constants";
import type { StockVelocityController } from "../lib/use-stock-velocity-controller";

type StockVelocityFiltersProps = {
  controller: StockVelocityController;
};

export function StockVelocityFilters({ controller }: StockVelocityFiltersProps) {
  return (
    <>
      <TaxonomyFilters controller={controller} />
      <div className="mb-3 flex items-center gap-3">
        <SearchBox controller={controller} />
        {controller.velocityFilter !== "all" && (
          <button onClick={() => controller.setVelocityFilter("all")} className="whitespace-nowrap text-xs text-primary hover:underline">
            Clear class filter
          </button>
        )}
        <ViewTabs controller={controller} />
        <VisibilityToggles controller={controller} />
        {controller.viewMode === "classification" && <UrgencyFilters controller={controller} />}
        <LastSoldFilter controller={controller} />
      </div>
    </>
  );
}

function TaxonomyFilters({ controller }: StockVelocityFiltersProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <select
        value={controller.familyFilter}
        onChange={(event) => controller.setFamilyFilter(event.target.value)}
        className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
      >
        <option value="">All Families</option>
        {controller.families.map((family: any) => <option key={family.id} value={family.id}>{family.name}</option>)}
      </select>
      <select
        value={controller.categoryFilter}
        onChange={(event) => controller.setCategoryFilter(event.target.value)}
        className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
      >
        <option value="">All Categories</option>
        {(controller.familyFilter
          ? controller.categories.filter((category: any) => category.familyId === controller.familyFilter)
          : controller.categories
        ).map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <select
        value={controller.subcategoryFilter}
        onChange={(event) => controller.setSubcategoryFilter(event.target.value)}
        className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
      >
        <option value="">All Sub-categories</option>
        {controller.filteredSubcategories.map((subcategory: any) => (
          <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
        ))}
      </select>
      <select
        value={controller.brandFilter}
        onChange={(event) => controller.setBrandFilter(event.target.value)}
        className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
      >
        <option value="">All Brands</option>
        {controller.brands.map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </select>
      {(controller.familyFilter || controller.categoryFilter || controller.subcategoryFilter || controller.brandFilter) && (
        <button onClick={controller.clearTaxonomyFilters} className="text-[11px] text-primary hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}

function SearchBox({ controller }: StockVelocityFiltersProps) {
  return (
    <div className="relative w-full max-w-md">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={controller.searchQuery}
        onChange={(event) => controller.handleSearchChange(event.target.value)}
        placeholder="Search product, SKU..."
        className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
      />
    </div>
  );
}

function ViewTabs({ controller }: StockVelocityFiltersProps) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
      {(["classification", "velocity", "reorder"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => controller.setViewMode(tab)}
          className={cn(
            "rounded-md px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap",
            controller.viewMode === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>{tab === "classification" ? "Classification" : tab === "velocity" ? "Velocity Analysis" : "Reorder"}</span>
          <span className="mt-0.5 block text-[8px] font-normal text-muted-foreground">
            {tab === "classification" ? "Stock levels & demand rates" : tab === "velocity" ? "Multi-window trend heatmap" : "Restock suggestions"}
          </span>
        </button>
      ))}
    </div>
  );
}

function VisibilityToggles({ controller }: StockVelocityFiltersProps) {
  return (
    <>
      <label className="flex cursor-pointer select-none items-center gap-1.5">
        <input
          type="checkbox"
          checked={controller.hideNegativeStock}
          onChange={(event) => controller.setHideNegativeStockPersisted(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-border accent-primary"
        />
        <span className="text-[11px] text-muted-foreground">Hide negative stock</span>
      </label>
      <button
        onClick={controller.toggleHideDC}
        className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${controller.hideDC ? "bg-gray-200 text-gray-700" : "bg-background border border-border text-muted-foreground hover:bg-muted"}`}
      >
        {controller.hideDC ? "Discontinued Hidden" : "Show Discontinued"}
      </button>
      <button
        onClick={controller.toggleHideSO}
        className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${controller.hideSO ? "bg-blue-100 text-blue-700" : "bg-background border border-border text-muted-foreground hover:bg-muted"}`}
      >
        {controller.hideSO ? "Special Order Hidden" : "Show Special Order"}
      </button>
    </>
  );
}

function UrgencyFilters({ controller }: StockVelocityFiltersProps) {
  return (
    <>
      <select
        value={controller.urgencyFilter}
        onChange={(event) => controller.setUrgencyFilter(event.target.value)}
        className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
      >
        <option value="">All Urgency</option>
        <option value="critical">ðŸŸ¤ Critical (&lt; 0.5 mo)</option>
        <option value="warning">ðŸŸ¡ Warning (&lt; 1.5 mo)</option>
        <option value="monitor">ðŸŸ  Monitor (&lt; 3 mo)</option>
      </select>
      {controller.urgencyFilter && (
        <select
          value={controller.urgencyWindow}
          onChange={(event) => controller.setUrgencyWindow(event.target.value)}
          className="h-8 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
        >
          <option value="">All Windows</option>
          <option value="12m">12M Rate</option>
          <option value="6m">6M Rate</option>
          <option value="3m">3M Rate</option>
          <option value="1m">1M Rate</option>
        </select>
      )}
    </>
  );
}

function LastSoldFilter({ controller }: StockVelocityFiltersProps) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">Last sold:</span>
      <DateRangePicker
        startDate={controller.lastSoldAfter}
        endDate={controller.lastSoldBefore}
        onChange={(start, end) => {
          controller.setLastSoldAfter(start);
          controller.setLastSoldBefore(end);
        }}
      />
    </div>
  );
}
