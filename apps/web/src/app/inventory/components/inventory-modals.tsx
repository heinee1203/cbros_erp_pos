"use client";

import { DetailDrawer } from "./detail-drawer";
import { QuickAddDrawer } from "./quick-add-drawer";
import { FindReplaceModal } from "./find-replace-modal";
import { AdjustModal } from "./adjust-modal";
import { TransferModal } from "./transfer-modal";
import { ImportItemsModal } from "./import-items-modal";
import { AvailableForSaleModal } from "./available-for-sale-modal";
import { QuickAddEntityModal } from "./quick-add-entity-modal";
import { SerialTrackingModal } from "./serial-tracking-modal";
import type { InventoryImportExportController } from "../lib/use-inventory-import-export";
import type { InventoryBulkActionsController } from "../lib/use-inventory-bulk-actions";
import type { InventoryModalStateController } from "../lib/use-inventory-modal-state";
import { useInventoryQuickCreate } from "../lib/use-inventory-quick-create";
import type { InventorySelectionController } from "../lib/use-inventory-selection";
import type { InventoryWorkspaceController } from "../lib/use-inventory-workspace";

interface InventoryModalsProps {
  apiLocationId: string | null;
  bulkActions: InventoryBulkActionsController;
  importExport: InventoryImportExportController;
  inventory: InventoryWorkspaceController;
  modalState: InventoryModalStateController;
  selection: InventorySelectionController;
  showFinancials: boolean;
  token: string | null;
  userRole: string;
}

export function InventoryModals({
  apiLocationId,
  bulkActions,
  importExport,
  inventory,
  modalState,
  selection,
  showFinancials,
  token,
  userRole,
}: InventoryModalsProps) {
  const quickCreate = useInventoryQuickCreate({ token, apiLocationId });
  const selectedProduct = modalState.selectedProductId
    ? inventory.products.find((product) => product.id === modalState.selectedProductId) ?? null
    : null;

  return (
    <>
      {modalState.showFindReplace && (
        <FindReplaceModal
          productIds={Array.from(selection.selectedIds)}
          products={inventory.products.filter((product) => selection.selectedIds.has(product.id))}
          token={token!}
          locationId={apiLocationId!}
          onClose={() => modalState.setShowFindReplace(false)}
          onApplied={() => {
            bulkActions.invalidateProductsAndClear();
            modalState.setShowFindReplace(false);
          }}
        />
      )}

      {modalState.showSerialModal && (
        <SerialTrackingModal
          count={selection.selectedCount}
          onClose={() => modalState.setShowSerialModal(false)}
          onApply={async (updates) => {
            await bulkActions.handleSerialTrackingApply(updates);
            modalState.setShowSerialModal(false);
          }}
        />
      )}

      {modalState.addModal && (
        <QuickAddEntityModal
          type={modalState.addModal}
          families={inventory.families}
          categories={inventory.filteredCategories}
          onClose={() => modalState.setAddModal(null)}
          onCreated={(type, id) => {
            modalState.setAddModal(null);
            if (type === "family") inventory.setFamilyFilter(id);
            else if (type === "category") inventory.setCategoryFilter(id);
            else if (type === "subcategory") inventory.setSubCategoryFilter(id);
            else if (type === "brand") inventory.setBrandFilter(id);
          }}
          createFamily={quickCreate.createFamily}
          createCategory={quickCreate.createCategory}
          createSubcategory={quickCreate.createSubcategory}
          createBrand={quickCreate.createBrand}
        />
      )}

      {selectedProduct && (
        <DetailDrawer
          product={selectedProduct}
          showFinancials={showFinancials}
          onClose={() => modalState.setSelectedProductId(null)}
          onTransfer={() => modalState.setShowTransferModal(true)}
          onAdjust={() => modalState.setShowAdjustModal(true)}
        />
      )}

      {modalState.showTransferModal && (
        <TransferModal onClose={() => modalState.setShowTransferModal(false)} />
      )}

      {modalState.showAvailModal && (
        <AvailableForSaleModal
          selectedIds={Array.from(selection.selectedIds)}
          locations={inventory.orgLocations}
          token={token}
          locationId={apiLocationId}
          onClose={() => modalState.setShowAvailModal(false)}
          onDone={() => {
            bulkActions.invalidateProductsAndClear();
            modalState.setShowAvailModal(false);
          }}
        />
      )}

      {modalState.showAdjustModal && modalState.selectedProductId && !inventory.isAllLocations && (
        <AdjustModal
          productId={modalState.selectedProductId}
          locationId={apiLocationId!}
          token={token!}
          onClose={() => modalState.setShowAdjustModal(false)}
        />
      )}

      {modalState.showQuickAdd && (
        <QuickAddDrawer
          token={token!}
          locationId={apiLocationId!}
          userRole={userRole}
          isAllLocations={inventory.isAllLocations}
          onClose={() => modalState.setShowQuickAdd(false)}
        />
      )}

      {modalState.showImportModal && (
        <ImportItemsModal
          importExport={importExport}
          onClose={() => modalState.setShowImportModal(false)}
        />
      )}
    </>
  );
}
