"use client";

import { Loader2 } from "lucide-react";
import { NewAdjustmentDrawer } from "./components/new-adjustment-drawer";
import { StockAdjustmentsContent } from "./components/stock-adjustments-content";
import { StockAdjustmentsFilters } from "./components/stock-adjustments-filters";
import { StockAdjustmentsFooter } from "./components/stock-adjustments-footer";
import { StockAdjustmentsHeader } from "./components/stock-adjustments-header";
import { useStockAdjustmentsController } from "./lib/use-stock-adjustments-controller";

export default function StockAdjustmentsPage() {
  const controller = useStockAdjustmentsController();

  if (controller.authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StockAdjustmentsHeader controller={controller} />
      <StockAdjustmentsFilters controller={controller} />
      <StockAdjustmentsContent controller={controller} />
      <StockAdjustmentsFooter controller={controller} />

      {controller.drawerOpen && (
        <NewAdjustmentDrawer
          token={controller.token}
          locationId={controller.locationId}
          locations={controller.locations}
          onClose={() => controller.setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
