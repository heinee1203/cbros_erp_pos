import { DollarSign } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function InventoryValuationReportPage() {
  return (
    <PageShell
      icon={DollarSign}
      title="Inventory Valuation"
      description="Calculate total inventory value at cost and retail across all locations. Track COGS and inventory turnover."
      relatedHref="/procurement/stock-levels"
      relatedLabel="View Stock Levels"
    />
  );
}
