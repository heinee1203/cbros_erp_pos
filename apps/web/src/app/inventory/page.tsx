"use client";

import { useAuth } from "@/app/auth-context";
import { useSidebar } from "@/app/sidebar-context";
import { InventoryBulkSelection } from "./components/inventory-bulk-selection";
import { InventoryFilterPanel } from "./components/inventory-filter-panel";
import { InventoryPageHeader } from "./components/inventory-page-header";
import { InventoryTableSection } from "./components/inventory-table-section";
import { InventoryModals } from "./components/inventory-modals";
import { useInventoryPageControllers } from "./lib/use-inventory-page-controllers";
import { useInventoryWorkspace } from "./lib/use-inventory-workspace";
import { WorkspacePage } from "@/components/ui/layout";

export default function InventoryPage() {
  const { token, locationId, apiLocationId, user } = useAuth();
  const { isCollapsed } = useSidebar();
  const isStaff = user?.role === "STAFF";
  const canEdit = !isStaff; // STAFF cannot add/edit/delete/import/export

  const showFinancials = (user?.permissions ?? []).includes("bo.view_cost");

  const inventory = useInventoryWorkspace({ token, apiLocationId, locationId });
  const { bulkActions, importExport, modalState, selection } = useInventoryPageControllers({
    apiLocationId,
    inventory,
    token,
  });

  return (
    <WorkspacePage className="max-w-[1500px]">
      <InventoryPageHeader
        canEdit={canEdit}
        isFetching={inventory.isFetching}
        isLoading={inventory.isLoading}
        totalItems={inventory.totalItems}
        viewMode={inventory.viewMode}
        onExport={importExport.handleExport}
        onImport={() => {
          importExport.resetImport();
          modalState.setShowImportModal(true);
        }}
        onQuickAdd={() => modalState.setShowQuickAdd(true)}
        onToggleViewMode={() => inventory.setViewMode((mode) => (mode === "flat" ? "nested" : "flat"))}
      />

      <InventoryFilterPanel
        canEdit={canEdit}
        inventory={inventory}
        onAddModal={modalState.setAddModal}
      />
      <InventoryBulkSelection
        bulkActions={bulkActions}
        inventory={inventory}
        importExport={importExport}
        isCollapsed={isCollapsed}
        modalState={modalState}
        selection={selection}
      />

      <InventoryTableSection
        apiLocationId={apiLocationId}
        bulkActions={bulkActions}
        canEdit={canEdit}
        inventory={inventory}
        modalState={modalState}
        selection={selection}
        showFinancials={showFinancials}
        token={token}
      />

      <InventoryModals
        apiLocationId={apiLocationId}
        bulkActions={bulkActions}
        importExport={importExport}
        inventory={inventory}
        modalState={modalState}
        selection={selection}
        showFinancials={showFinancials}
        token={token}
        userRole={user?.role ?? ""}
      />
    </WorkspacePage>
  );
}
