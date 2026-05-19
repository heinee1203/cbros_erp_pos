"use client";

import { SalesByCategoryFilters } from "./components/sales-by-category-filters";
import { SalesByCategoryHeader } from "./components/sales-by-category-header";
import { SalesByCategoryTable } from "./components/sales-by-category-table";
import { useSalesByCategoryController } from "./lib/use-sales-by-category-controller";

export default function SalesByCategoryPage() {
  const controller = useSalesByCategoryController();

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <SalesByCategoryHeader
        summary={controller.summary}
        avgMargin={controller.avgMargin}
        categoryCount={controller.filtered.length}
      />
      <SalesByCategoryFilters controller={controller} />
      <SalesByCategoryTable controller={controller} />
    </div>
  );
}
