import { ProductReorderModal, ReorderSuccessToast } from "@/components/procurement/reorder-workflow";
import type { StockLevelsController } from "../types";

type StockLevelsReorderWorkflowProps = {
  controller: StockLevelsController;
};

export function StockLevelsReorderWorkflow({ controller }: StockLevelsReorderWorkflowProps) {
  return (
    <>
      <ReorderSuccessToast message={controller.successMessage} showIcon={false} />

      {controller.reorderModal && (
        <ProductReorderModal
          item={controller.reorderModal.item}
          data={controller.reorderModal.data}
          onDismiss={controller.dismissModal}
          onAddToExisting={(po) => controller.viewExistingDraft(po.poNumber)}
          onCreateNew={() =>
            controller.createDraftPO(
              controller.reorderModal!.item,
              controller.reorderModal!.data.lastSupplier,
              controller.reorderModal!.data.suggestedQty,
            )
          }
          onSnooze={(days) => controller.handleSnooze(controller.reorderModal!.item.productId, days)}
        />
      )}
    </>
  );
}
