import type { BackordersPageController } from "../lib/use-backorders-page-controller";

type BackordersFooterProps = {
  controller: BackordersPageController;
};

export function BackordersFooter({ controller }: BackordersFooterProps) {
  return (
    <div className="border-t border-border bg-background px-6 py-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {controller.isGroupedView
            ? `${controller.filteredSupplierGroups.length} supplier(s), ${controller.totalGroupedPending} pending item(s)`
            : `${controller.filteredFlatItems.length} backorder(s)`}
          {controller.searchQuery ? " (filtered)" : ""}
        </span>
        <button
          onClick={controller.reload}
          className="text-[10px] font-medium text-primary hover:underline"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
