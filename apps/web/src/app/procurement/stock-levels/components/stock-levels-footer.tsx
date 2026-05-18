import { ChevronsDown, Loader2 } from "lucide-react";
import type { StockLevelsController } from "../types";

type StockLevelsFooterProps = {
  controller: StockLevelsController;
};

export function StockLevelsFooter({ controller }: StockLevelsFooterProps) {
  const loadedLabel =
    controller.viewMode === "product"
      ? `${controller.productRows.length}${
          controller.productSummary
            ? ` of ${controller.productSummary.totalProducts.toLocaleString()}`
            : ""
        } product${controller.productRows.length !== 1 ? "s" : ""} loaded`
      : `${controller.rows.length}${
          controller.summary
            ? ` of ${controller.summary.totalSkus.toLocaleString()}`
            : ""
        } item${controller.rows.length !== 1 ? "s" : ""} loaded`;

  return (
    <div className="border-t border-border/70 bg-background/70 px-4 py-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {loadedLabel}
          {controller.hasActiveFilters ? " (filtered)" : ""}
          {controller.hasNextPage ? " - more available" : ""}
        </span>
        <div className="flex items-center gap-3">
          {controller.hasNextPage && (
            <button
              onClick={controller.fetchNextPage}
              disabled={controller.isFetchingNextPage}
              className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {controller.isFetchingNextPage ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ChevronsDown size={12} />
              )}
              Load More
            </button>
          )}
          <span className="flex items-center gap-1 rounded bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            Live data - GET /inventory/stock-levels
          </span>
        </div>
      </div>
    </div>
  );
}
