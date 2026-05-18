import { ChevronsDown, Loader2 } from "lucide-react";
import type { StockAdjustmentsController } from "../lib/use-stock-adjustments-controller";

type StockAdjustmentsFooterProps = {
  controller: StockAdjustmentsController;
};

export function StockAdjustmentsFooter({ controller }: StockAdjustmentsFooterProps) {
  return (
    <div className="border-t border-border bg-background px-6 py-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {controller.totalCount} adjustment{controller.totalCount !== 1 ? "s" : ""} loaded
          {controller.hasActiveFilters ? " (filtered)" : ""}
          {controller.hasNextPage ? " \u2014 more available" : ""}
        </span>
        <div className="flex items-center gap-3">
          {controller.hasNextPage && (
            <button
              onClick={() => controller.fetchNextPage()}
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
            Live data {"\u00e2\u20ac\u201d"} GET /inventory/journal
          </span>
        </div>
      </div>
    </div>
  );
}
