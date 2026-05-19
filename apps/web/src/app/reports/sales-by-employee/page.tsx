"use client";

import { SalesByEmployeeFilters } from "./components/sales-by-employee-filters";
import { SalesByEmployeeHeader } from "./components/sales-by-employee-header";
import { SalesByEmployeeTable } from "./components/sales-by-employee-table";
import { useSalesByEmployeeController } from "./lib/use-sales-by-employee-controller";

export default function SalesByEmployeePage() {
  const controller = useSalesByEmployeeController();

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <SalesByEmployeeHeader
        summary={controller.summary}
        employeeCount={controller.filtered.length}
        avgPerEmployee={controller.avgPerEmployee}
      />
      <SalesByEmployeeFilters controller={controller} />
      <SalesByEmployeeTable controller={controller} />
    </div>
  );
}
