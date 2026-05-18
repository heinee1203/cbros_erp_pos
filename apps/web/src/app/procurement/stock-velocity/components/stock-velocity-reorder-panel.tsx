import { ReorderSuggestionsPanel } from "../reorder-panel";
import type { StockVelocityController } from "../lib/use-stock-velocity-controller";

type StockVelocityReorderPanelProps = {
  controller: StockVelocityController;
};

export function StockVelocityReorderPanel({ controller }: StockVelocityReorderPanelProps) {
  return (
    <ReorderSuggestionsPanel
      open={controller.reorderPanelOpen || controller.viewMode === "reorder"}
      onClose={controller.closeReorderPanel}
      inline={controller.viewMode === "reorder"}
      lastSoldAfter={controller.lastSoldAfter}
      lastSoldBefore={controller.lastSoldBefore}
      urgencyAll={controller.leftFilterAll !== "all" ? controller.leftFilterAll : undefined}
      urgency12M={controller.leftFilter12m !== "all" ? controller.leftFilter12m : undefined}
      urgency6M={controller.leftFilter6m !== "all" ? controller.leftFilter6m : undefined}
      urgency3M={controller.leftFilter3m !== "all" ? controller.leftFilter3m : undefined}
      urgency1M={controller.leftFilter1m !== "all" ? controller.leftFilter1m : undefined}
      velocityClass={controller.velocityFilter !== "all" ? controller.velocityFilter : undefined}
      brandId={controller.brandFilter}
      categoryId={controller.categoryFilter}
      brandName={controller.brandName}
      categoryName={controller.categoryName}
    />
  );
}
