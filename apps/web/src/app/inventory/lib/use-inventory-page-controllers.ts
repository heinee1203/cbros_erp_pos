"use client";

import { useInventoryBulkActions } from "./use-inventory-bulk-actions";
import { useInventoryImportExport } from "./use-inventory-import-export";
import { useInventoryModalState } from "./use-inventory-modal-state";
import { useInventorySelection } from "./use-inventory-selection";
import type { InventoryWorkspaceController } from "./use-inventory-workspace";

interface UseInventoryPageControllersOptions {
  apiLocationId: string | null;
  inventory: InventoryWorkspaceController;
  token: string | null;
}

export function useInventoryPageControllers({
  apiLocationId,
  inventory,
  token,
}: UseInventoryPageControllersOptions) {
  const selection = useInventorySelection();

  const importExport = useInventoryImportExport({
    token,
    apiLocationId,
    selectedIds: selection.selectedIds,
    sortBy: inventory.sortBy,
    sortDir: inventory.sortDir,
    debouncedSearch: inventory.debouncedSearch,
    familyFilter: inventory.familyFilter,
    categoryFilter: inventory.categoryFilter,
    subCategoryFilter: inventory.subCategoryFilter,
    brandFilter: inventory.brandFilter,
  });

  const bulkActions = useInventoryBulkActions({
    token,
    apiLocationId,
    selectedIds: selection.selectedIds,
    setSelectedIds: selection.setSelectedIds,
    products: inventory.products,
  });

  const modalState = useInventoryModalState({
    selectedCount: selection.selectedCount,
    onClearSelection: bulkActions.clearSelection,
  });

  return {
    bulkActions,
    importExport,
    modalState,
    selection,
  };
}

export type InventoryPageControllers = ReturnType<typeof useInventoryPageControllers>;
