import { ArrowLeftRight } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function StockMovementPage() {
  return (
    <PageShell
      icon={ArrowLeftRight}
      title="Stock Movement"
      description="Track all inventory movements — sales, purchases, transfers, adjustments, and returns — in a unified timeline."
      relatedHref="/procurement/inventory-history"
      relatedLabel="View Inventory History"
    />
  );
}
