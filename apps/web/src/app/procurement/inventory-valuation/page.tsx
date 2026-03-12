import { DollarSign } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function InventoryValuationPage() {
  return (
    <PageShell
      icon={DollarSign}
      title="Inventory Valuation"
      description="Inventory valuation reports are coming soon. View cost basis, weighted average pricing, and total inventory value by location."
    />
  );
}
