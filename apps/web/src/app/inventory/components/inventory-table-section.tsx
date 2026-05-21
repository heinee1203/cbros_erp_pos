import { InventoryTableShell } from "./inventory-table-shell";
import type { InventoryBulkActionsController } from "../lib/use-inventory-bulk-actions";
import type { InventoryModalStateController } from "../lib/use-inventory-modal-state";
import type { InventorySelectionController } from "../lib/use-inventory-selection";
import type { InventoryWorkspaceController } from "../lib/use-inventory-workspace";

interface InventoryTableSectionProps {
  apiLocationId: string | null;
  bulkActions: InventoryBulkActionsController;
  canEdit: boolean;
  inventory: InventoryWorkspaceController;
  modalState: InventoryModalStateController;
  selection: InventorySelectionController;
  showFinancials: boolean;
  token: string | null;
}

export function InventoryTableSection({
  apiLocationId,
  bulkActions,
  canEdit,
  inventory,
  modalState,
  selection,
  showFinancials,
  token,
}: InventoryTableSectionProps) {
  return (
    <InventoryTableShell
      products={inventory.products}
      isLoading={inventory.isLoading}
      searchQuery={inventory.searchQuery}
      hasActiveFilters={inventory.hasActiveFilters}
      selectedIds={selection.selectedIds}
      setSelectedIds={selection.setSelectedIds}
      showFinancials={showFinancials}
      effectiveViewMode={inventory.effectiveViewMode}
      sortBy={inventory.sortBy}
      sortDir={inventory.sortDir}
      page={inventory.page}
      pageSize={inventory.pageSize}
      totalItems={inventory.totalItems}
      totalPages={inventory.totalPages}
      hasMore={inventory.hasMore}
      token={token!}
      apiLocationId={apiLocationId!}
      stockStatusFilter={inventory.stockStatusFilter}
      familyFilter={inventory.familyFilter}
      categoryFilter={inventory.categoryFilter}
      brandFilter={inventory.brandFilter}
      isAllLocations={inventory.isAllLocations}
      canEdit={canEdit}
      onSort={inventory.handleSort}
      onPageChange={inventory.setPage}
      onPageSizeChange={inventory.setPageSize}
      onSelectProduct={modalState.setSelectedProductId}
      onDeleteSingle={bulkActions.handleDeleteSingle}
      onClearFilters={inventory.clearAllFilters}
    />
  );
}
