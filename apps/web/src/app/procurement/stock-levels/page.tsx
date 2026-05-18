"use client";

import { Suspense } from "react";
import { LoadingState, WorkspacePage } from "@/components/ui/layout";
import { StockLevelsContent } from "./components/stock-levels-content";
import { StockLevelsFilters } from "./components/stock-levels-filters";
import { StockLevelsHeader } from "./components/stock-levels-header";
import { StockLevelsReorderWorkflow } from "./components/stock-levels-reorder-workflow";
import { StockLevelsSummary } from "./components/stock-levels-summary";
import { useStockLevelsController } from "./lib/use-stock-levels-controller";

export default function StockLevelsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading stock levels..." />}>
      <StockLevelsInner />
    </Suspense>
  );
}

function StockLevelsInner() {
  const controller = useStockLevelsController();

  if (controller.authLoading) {
    return <LoadingState label="Preparing stock workspace..." />;
  }

  return (
    <>
      <WorkspacePage className="max-w-[1500px]">
        <StockLevelsHeader />
        <StockLevelsSummary controller={controller} />
        <StockLevelsFilters controller={controller} />
        <StockLevelsContent controller={controller} />
      </WorkspacePage>

      <StockLevelsReorderWorkflow controller={controller} />
    </>
  );
}
