import { Loader2 } from "lucide-react";
import type { StockLevelsController } from "../types";
import { EmptyState } from "./empty-state";
import { LocationStockTable } from "./location-stock-table";
import { StockLevelsFooter } from "./stock-levels-footer";
import { ProductStockTable } from "./product-stock-table";

type StockLevelsContentProps = {
  controller: StockLevelsController;
};

export function StockLevelsContent({ controller }: StockLevelsContentProps) {
  return (
    <section className="surface-card overflow-hidden rounded-2xl">
      <div className="max-h-[calc(100vh-24rem)] min-h-[28rem] overflow-auto">
        {controller.isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : controller.isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load stock levels</p>
            <p className="text-xs text-muted-foreground">
              {(controller.error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : controller.viewMode === "product" ? (
          <ProductStockLevelsView controller={controller} />
        ) : (
          <LocationStockLevelsView controller={controller} />
        )}
      </div>
      <StockLevelsFooter controller={controller} />
    </section>
  );
}

function ProductStockLevelsView({ controller }: StockLevelsContentProps) {
  if (controller.productRows.length === 0) {
    return <EmptyState hasFilters={controller.hasActiveFilters} />;
  }

  return (
    <ProductStockTable
      rows={controller.productRows}
      isFetchingNextPage={controller.isFetchingNextPage}
      onReorder={controller.handleReorder}
      reorderLoading={controller.reorderLoading}
    />
  );
}

function LocationStockLevelsView({ controller }: StockLevelsContentProps) {
  if (controller.rows.length === 0) {
    return <EmptyState hasFilters={controller.hasActiveFilters} />;
  }

  return (
    <LocationStockTable
      rows={controller.rows}
      isFetchingNextPage={controller.isFetchingNextPage}
      sortBy={controller.sortBy}
      sortDir={controller.sortDir}
      onSort={controller.handleSort}
      onReorder={controller.handleReorder}
      reorderLoading={controller.reorderLoading}
    />
  );
}
