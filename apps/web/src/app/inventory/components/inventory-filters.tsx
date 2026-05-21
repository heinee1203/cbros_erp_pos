"use client";

import { startTransition, type RefObject } from "react";
import { Plus, Search, X } from "lucide-react";
import type { Brand } from "@/hooks/use-brands";
import type { CategoryRow } from "@/hooks/use-categories";
import type { ProductFamily } from "@/hooks/use-products";
import type { SubcategoryRow } from "@/hooks/use-subcategories";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "./searchable-select";

type AddModalTarget = "family" | "category" | "subcategory" | "brand";

interface InventoryFiltersProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  familyFilter: string;
  categoryFilter: string;
  subCategoryFilter: string;
  stockStatusFilter: string;
  brandFilter: string;
  hideSO: boolean;
  hideDC: boolean;
  canEdit: boolean;
  hasActiveFilters: boolean;
  totalItems: number;
  families: ProductFamily[];
  filteredCategories: CategoryRow[];
  filteredSubcategories: SubcategoryRow[];
  brandsList: Brand[];
  onSearchQueryChange: (value: string) => void;
  onSubmitSearch: () => void;
  onClearSearch: () => void;
  onFamilyChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSubCategoryChange: (value: string) => void;
  onStockStatusChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onToggleHideSO: () => void;
  onToggleHideDC: () => void;
  onAddModal: (target: AddModalTarget) => void;
  onClearAllFilters: () => void;
}

export function InventoryFilters({
  searchInputRef,
  searchQuery,
  familyFilter,
  categoryFilter,
  subCategoryFilter,
  stockStatusFilter,
  brandFilter,
  hideSO,
  hideDC,
  canEdit,
  hasActiveFilters,
  totalItems,
  families,
  filteredCategories,
  filteredSubcategories,
  brandsList,
  onSearchQueryChange,
  onSubmitSearch,
  onClearSearch,
  onFamilyChange,
  onCategoryChange,
  onSubCategoryChange,
  onStockStatusChange,
  onBrandChange,
  onToggleHideSO,
  onToggleHideDC,
  onAddModal,
  onClearAllFilters,
}: InventoryFiltersProps) {
  return (
    <section className="surface-card rounded-2xl p-4">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={searchInputRef}
          type="text"
          defaultValue={searchQuery}
          onChange={(e) => startTransition(() => onSearchQueryChange(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmitSearch();
            }
          }}
          placeholder="Search items, SKU, OEM... (press Enter)"
          className="h-10 w-full rounded-xl border border-border bg-background/80 pl-9 pr-16 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/50 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          title="Tip: begins:NIS (starts with) | sku:SB-4122 (exact SKU) | barcode:4289 (barcode starts with) | use commas for multiple"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {searchQuery && (
            <button onClick={onClearSearch} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
          <button
            onClick={onSubmitSearch}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/[0.06] hover:text-primary"
            title="Search"
          >
            <Search size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <select
            value={familyFilter}
            onChange={(e) => onFamilyChange(e.target.value)}
            className="h-8 rounded-lg rounded-r-none border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          >
            <option value="">All Families</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>{family.name}</option>
            ))}
          </select>
          {canEdit && <AddFilterButton label="Add Family" onClick={() => onAddModal("family")} />}
        </div>

        <div className="flex items-center">
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="h-8 rounded-lg rounded-r-none border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          >
            <option value="">All Categories</option>
            <option value="__none__" className="italic text-muted-foreground">-- No Category --</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          {canEdit && <AddFilterButton label="Add Category" onClick={() => onAddModal("category")} />}
        </div>

        <div className="flex items-center">
          <SearchableSelect
            value={subCategoryFilter}
            onChange={onSubCategoryChange}
            options={[
              { value: "__none__", label: "-- No Subcategory --" },
              ...filteredSubcategories.map((subcategory) => ({ value: subcategory.id, label: subcategory.name })),
            ]}
            placeholder="All Sub-categories"
          />
          {canEdit && <AddFilterButton label="Add Sub-category" onClick={() => onAddModal("subcategory")} />}
        </div>

        <select
          value={stockStatusFilter}
          onChange={(e) => onStockStatusChange(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
          <option value="special_order">Special Order</option>
        </select>

        <div className="flex items-center">
          <select
            value={brandFilter}
            onChange={(e) => onBrandChange(e.target.value)}
            className="h-8 rounded-lg rounded-r-none border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          >
            <option value="">All Brands</option>
            <option value="__none__" className="italic text-muted-foreground">-- No Brand --</option>
            {brandsList.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </select>
          {canEdit && <AddFilterButton label="Add Brand" onClick={() => onAddModal("brand")} />}
        </div>

        <button
          onClick={onToggleHideSO}
          className={cn(
            "h-8 rounded-lg border px-2.5 text-[11px] font-medium transition-colors",
            hideSO
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          {hideSO ? "SO Hidden" : "Hide SO"}
        </button>
        <button
          onClick={onToggleHideDC}
          className={cn(
            "h-8 rounded-lg border px-2.5 text-[11px] font-medium transition-colors",
            hideDC
              ? "border-gray-400 bg-gray-100 text-gray-700"
              : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          {hideDC ? "DC Hidden" : "Hide DC"}
        </button>
      </div>

      {hasActiveFilters && (
        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {totalItems.toLocaleString()} result{totalItems !== 1 ? "s" : ""}
          </span>
          <span className="text-border">&middot;</span>
          <button
            onClick={onClearAllFilters}
            className="font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}

function AddFilterButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 rounded-lg rounded-l-none border border-l-0 border-border bg-background px-1.5 text-primary transition-colors hover:bg-muted"
      title={label}
    >
      <Plus size={13} />
    </button>
  );
}
