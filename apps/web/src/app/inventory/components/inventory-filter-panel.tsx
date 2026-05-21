"use client";

import { InventoryFilters } from "./inventory-filters";
import type { QuickAddEntityType } from "./quick-add-entity-modal";
import type { InventoryWorkspaceController } from "../lib/use-inventory-workspace";

interface InventoryFilterPanelProps {
  canEdit: boolean;
  inventory: InventoryWorkspaceController;
  onAddModal: (type: QuickAddEntityType | null) => void;
}

export function InventoryFilterPanel({
  canEdit,
  inventory,
  onAddModal,
}: InventoryFilterPanelProps) {
  return (
    <InventoryFilters
      searchInputRef={inventory.searchInputRef}
      searchQuery={inventory.searchQuery}
      familyFilter={inventory.familyFilter}
      categoryFilter={inventory.categoryFilter}
      subCategoryFilter={inventory.subCategoryFilter}
      stockStatusFilter={inventory.stockStatusFilter}
      brandFilter={inventory.brandFilter}
      hideSO={inventory.hideSO}
      hideDC={inventory.hideDC}
      canEdit={canEdit}
      hasActiveFilters={inventory.hasActiveFilters}
      totalItems={inventory.totalItems}
      families={inventory.families}
      filteredCategories={inventory.filteredCategories}
      filteredSubcategories={inventory.filteredSubcategories}
      brandsList={inventory.brandsList}
      onSearchQueryChange={inventory.setSearchQuery}
      onSubmitSearch={inventory.submitSearch}
      onClearSearch={inventory.clearSearch}
      onFamilyChange={(value) => {
        inventory.setFamilyFilter(value);
        inventory.setCategoryFilter("");
        inventory.setSubCategoryFilter("");
      }}
      onCategoryChange={(value) => {
        inventory.setCategoryFilter(value);
        inventory.setSubCategoryFilter("");
      }}
      onSubCategoryChange={inventory.setSubCategoryFilter}
      onStockStatusChange={inventory.setStockStatusFilter}
      onBrandChange={(value) => {
        inventory.setBrandFilter(value);
        inventory.setPage(1);
      }}
      onToggleHideSO={inventory.toggleHideSO}
      onToggleHideDC={inventory.toggleHideDC}
      onAddModal={onAddModal}
      onClearAllFilters={inventory.clearAllFilters}
    />
  );
}
