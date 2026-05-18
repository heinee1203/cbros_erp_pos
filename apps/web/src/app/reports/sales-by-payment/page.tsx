"use client";

import { SalesByPaymentFilters } from "./components/sales-by-payment-filters";
import { SalesByPaymentHeader } from "./components/sales-by-payment-header";
import { SalesByPaymentResults } from "./components/sales-by-payment-results";
import { useSalesByPaymentController } from "./lib/use-sales-by-payment-controller";

export default function SalesByPaymentPage() {
  const controller = useSalesByPaymentController();

  return (
    <div className="space-y-6 p-6">
      <SalesByPaymentHeader controller={controller} />
      <SalesByPaymentFilters controller={controller} />
      <SalesByPaymentResults controller={controller} />
    </div>
  );
}
