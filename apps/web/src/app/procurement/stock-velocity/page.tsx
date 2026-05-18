"use client";

import { Loader2 } from "lucide-react";
import { StockVelocityContent } from "./components/stock-velocity-content";
import { StockVelocityFilters } from "./components/stock-velocity-filters";
import { StockVelocityHeader } from "./components/stock-velocity-header";
import { StockVelocityReorderPanel } from "./components/stock-velocity-reorder-panel";
import { StockVelocitySummary } from "./components/stock-velocity-summary";
import { useStockVelocityController } from "./lib/use-stock-velocity-controller";

export default function StockVelocityPage() {
  const controller = useStockVelocityController();

  if (controller.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StockVelocityHeader controller={controller} />
      <StockVelocitySummary controller={controller} />
      <StockVelocityFilters controller={controller} />
      <StockVelocityContent controller={controller} />
      <StockVelocityReorderPanel controller={controller} />
    </div>
  );
}
