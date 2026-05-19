"use client";

import { SalesByItemFilters } from "./components/sales-by-item-filters";
import { SalesByItemHeader } from "./components/sales-by-item-header";
import { SalesByItemTable } from "./components/sales-by-item-table";
import { useSalesByItemController } from "./lib/use-sales-by-item-controller";

export default function SalesByItemPage() {
  const controller = useSalesByItemController();

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <SalesByItemHeader
        summary={controller.summary}
        uniqueItemCount={controller.uniqueItemCount}
      />
      <SalesByItemFilters controller={controller} />
      <SalesByItemTable controller={controller} />
    </div>
  );
}
