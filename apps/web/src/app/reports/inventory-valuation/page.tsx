"use client";

import { InventoryValuationChart } from "./components/inventory-valuation-chart";
import { InventoryValuationFilters } from "./components/inventory-valuation-filters";
import { InventoryValuationHeader } from "./components/inventory-valuation-header";
import { InventoryValuationTable } from "./components/inventory-valuation-table";
import { useInventoryValuationController } from "./lib/use-inventory-valuation-controller";

export default function InventoryValuationPage() {
  const controller = useInventoryValuationController();

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <InventoryValuationHeader
        totals={controller.totals}
        dismissWarning={controller.dismissWarning}
        onDismissWarning={() => controller.setDismissWarning(true)}
      />
      <InventoryValuationFilters controller={controller} />
      <InventoryValuationChart
        chartData={controller.chartData}
        totals={controller.totals}
        groupBy={controller.groupBy}
        isLoading={controller.isLoading}
      />
      <InventoryValuationTable controller={controller} />
    </div>
  );
}
