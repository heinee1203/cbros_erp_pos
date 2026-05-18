"use client";

import { DiscountAnalysisFilters } from "./components/discount-analysis-filters";
import { DiscountAnalysisHeader } from "./components/discount-analysis-header";
import { DiscountAnalysisResults } from "./components/discount-analysis-results";
import { useDiscountAnalysisController } from "./lib/use-discount-analysis-controller";

export default function DiscountAnalysisPage() {
  const controller = useDiscountAnalysisController();

  return (
    <div className="space-y-6 p-6">
      <DiscountAnalysisHeader />
      <DiscountAnalysisFilters controller={controller} />
      <DiscountAnalysisResults controller={controller} />
    </div>
  );
}
