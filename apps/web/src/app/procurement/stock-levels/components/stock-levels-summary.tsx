import type { StockLevelsController } from "../types";
import { ProductSummaryStrip, SummaryStrip } from "./summary-strips";

type StockLevelsSummaryProps = {
  controller: StockLevelsController;
};

export function StockLevelsSummary({ controller }: StockLevelsSummaryProps) {
  if (controller.viewMode === "product" && controller.productSummary) {
    return <ProductSummaryStrip summary={controller.productSummary} />;
  }

  if (controller.viewMode === "location" && controller.summary) {
    return <SummaryStrip summary={controller.summary} />;
  }

  return null;
}
