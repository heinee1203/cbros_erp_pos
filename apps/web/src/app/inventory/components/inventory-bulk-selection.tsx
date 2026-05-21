"use client";

import { BulkSelectionBar } from "./bulk-selection-bar";
import type { InventoryBulkActionsController } from "../lib/use-inventory-bulk-actions";
import type { InventoryImportExportController } from "../lib/use-inventory-import-export";
import type { InventoryModalStateController } from "../lib/use-inventory-modal-state";
import type { InventorySelectionController } from "../lib/use-inventory-selection";
import type { InventoryWorkspaceController } from "../lib/use-inventory-workspace";

interface InventoryBulkSelectionProps {
  bulkActions: InventoryBulkActionsController;
  importExport: InventoryImportExportController;
  isCollapsed: boolean;
  modalState: InventoryModalStateController;
  selection: InventorySelectionController;
  inventory: InventoryWorkspaceController;
}

export function InventoryBulkSelection({
  bulkActions,
  importExport,
  isCollapsed,
  modalState,
  selection,
  inventory,
}: InventoryBulkSelectionProps) {
  return (
    <BulkSelectionBar
      selectedCount={selection.selectedCount}
      isCollapsed={isCollapsed}
      deletePending={bulkActions.deletePending}
      categoryOptions={inventory.filteredCategories.map((category) => ({ id: category.id, name: category.name }))}
      brandOptions={inventory.brandsList.map((brand) => ({ id: brand.id, name: brand.name }))}
      familyOptions={inventory.families.map((family) => ({ id: family.id, name: family.name }))}
      subcategoryOptions={inventory.allSubcategories.map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        categoryId: subcategory.categoryId,
      }))}
      onDelete={bulkActions.handleBulkDelete}
      onExportSelected={importExport.handleExportSelected}
      onBulkUpdate={bulkActions.handleBulkUpdate}
      onOpenAvailability={() => modalState.setShowAvailModal(true)}
      onOpenSerialTracking={() => modalState.setShowSerialModal(true)}
      onOpenFindReplace={() => modalState.setShowFindReplace(true)}
      onClearSelection={bulkActions.clearSelection}
    />
  );
}
