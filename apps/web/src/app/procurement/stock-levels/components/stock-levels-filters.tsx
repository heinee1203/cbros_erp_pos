import { AlertTriangle, Search, X } from "lucide-react";
import type { StockLevelsController } from "../types";
import { FilterSelect } from "./filter-select";

type StockLevelsFiltersProps = {
  controller: StockLevelsController;
};

export function StockLevelsFilters({ controller }: StockLevelsFiltersProps) {
  return (
    <section className="surface-card rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewModeToggle controller={controller} />
        {controller.viewMode === "location" && <LocationScopeToggle controller={controller} />}
        <TaxonomyFilters controller={controller} />
        <StockStatusFilter controller={controller} />
        <BelowReorderToggle controller={controller} />
        <SearchBox controller={controller} />
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
    </section>
  );
}

function ViewModeToggle({ controller }: StockLevelsFiltersProps) {
  return (
    <div className="flex rounded-md border border-border">
      <button
        onClick={() => controller.setViewMode("product")}
        className={`h-8 px-3 text-xs font-medium transition-colors ${controller.viewMode === "product" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
      >
        By Product
      </button>
      <button
        onClick={() => controller.setViewMode("location")}
        className={`h-8 border-l border-border px-3 text-xs font-medium transition-colors ${controller.viewMode === "location" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
      >
        By Location
      </button>
    </div>
  );
}

function LocationScopeToggle({ controller }: StockLevelsFiltersProps) {
  return (
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
  );
}

function TaxonomyFilters({ controller }: StockLevelsFiltersProps) {
  return (
    <>
      <FilterSelect
        value={controller.familyFilter}
        onChange={(value) => {
          controller.setFamilyFilter(value);
          controller.setCategoryFilter("all");
          controller.setSubcategoryFilter("all");
        }}
        options={[
          { value: "all", label: "All Families" },
          ...controller.allFamilies.map((family: any) => ({ value: family.id, label: family.name })),
        ]}
      />
      <FilterSelect
        value={controller.categoryFilter}
        onChange={(value) => {
          controller.setCategoryFilter(value);
          controller.setSubcategoryFilter("all");
        }}
        options={[
          { value: "all", label: "All Categories" },
          ...controller.filteredCategories.map((category: any) => ({ value: category.id, label: category.name })),
        ]}
      />
      <FilterSelect
        value={controller.subcategoryFilter}
        onChange={controller.setSubcategoryFilter}
        options={[
          { value: "all", label: "All Sub-categories" },
          ...controller.filteredSubcategories.map((subcategory: any) => ({
            value: subcategory.id,
            label: subcategory.name,
          })),
        ]}
      />
    </>
  );
}

function StockStatusFilter({ controller }: StockLevelsFiltersProps) {
  return (
    <FilterSelect
      value={controller.stockStatusFilter}
      onChange={controller.setStockStatusFilter}
      options={[
        { value: "all", label: "All Statuses" },
        { value: "IN_STOCK", label: "In Stock" },
        { value: "LOW_STOCK", label: "Low Stock" },
        { value: "OUT_OF_STOCK", label: "Out of Stock" },
      ]}
    />
  );
}

function BelowReorderToggle({ controller }: StockLevelsFiltersProps) {
  return (
    <button
      onClick={() => controller.setBelowReorder(!controller.belowReorder)}
      className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
        controller.belowReorder
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      <AlertTriangle size={12} />
      Below Reorder
    </button>
  );
}

function SearchBox({ controller }: StockLevelsFiltersProps) {
  return (
    <div className="relative ml-auto">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={controller.searchQuery}
        onChange={(event) => controller.handleSearchChange(event.target.value)}
        placeholder="Search item, SKU..."
        className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
      />
    </div>
  );
}
