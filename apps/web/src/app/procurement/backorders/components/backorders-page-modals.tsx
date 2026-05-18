import type { BackordersPageController } from "../lib/use-backorders-page-controller";
import {
  CancelBackorderModal,
  EditBackorderModal,
  NewBackorderModal,
  ResourceBackorderModal,
} from "./backorder-modals";

type BackordersPageModalsProps = {
  controller: BackordersPageController;
};

export function BackordersPageModals({ controller }: BackordersPageModalsProps) {
  return (
    <>
      {controller.cancelModal && (
        <CancelBackorderModal
          item={controller.cancelModal}
          reason={controller.cancelReason}
          loading={controller.cancelLoading}
          onReasonChange={controller.setCancelReason}
          onClose={() => controller.setCancelModal(null)}
          onConfirm={controller.handleCancel}
        />
      )}

      {controller.resourceModal && (
        <ResourceBackorderModal
          item={controller.resourceModal}
          supplierId={controller.resourceSupplierId}
          suppliers={controller.suppliers}
          loading={controller.resourceLoading}
          onSupplierChange={controller.setResourceSupplierId}
          onClose={() => controller.setResourceModal(null)}
          onConfirm={controller.handleResource}
        />
      )}

      {controller.editModal && (
        <EditBackorderModal
          item={controller.editModal}
          priority={controller.editPriority}
          neededBy={controller.editNeededBy}
          notes={controller.editNotes}
          loading={controller.editLoading}
          onPriorityChange={controller.setEditPriority}
          onNeededByChange={controller.setEditNeededBy}
          onNotesChange={controller.setEditNotes}
          onClose={() => controller.setEditModal(null)}
          onSave={controller.handleEdit}
        />
      )}

      {controller.newModal && (
        <NewBackorderModal
          selectedProduct={controller.newSelectedProduct}
          productSearch={controller.newProductSearch}
          productResults={controller.newProductResults}
          productSearchLoading={controller.productSearchLoading}
          suppliers={controller.suppliers}
          supplierId={controller.newSupplierId}
          qty={controller.newQty}
          reason={controller.newReason}
          priority={controller.newPriority}
          neededBy={controller.newNeededBy}
          loading={controller.newLoading}
          onClose={controller.resetNewModal}
          onProductSearchChange={controller.setNewProductSearch}
          onProductResultsChange={controller.setNewProductResults}
          onSelectedProductChange={controller.setNewSelectedProduct}
          onSupplierChange={controller.setNewSupplierId}
          onQtyChange={controller.setNewQty}
          onReasonChange={controller.setNewReason}
          onPriorityChange={controller.setNewPriority}
          onNeededByChange={controller.setNewNeededBy}
          onCreate={controller.handleCreateNew}
        />
      )}
    </>
  );
}
