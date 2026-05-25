import { UnavailableFeaturePage } from "@/components/unavailable-feature-page";

export default function StockMovementPage() {
  return (
    <UnavailableFeaturePage
      title="Stock Movement"
      description="The unified stock movement report is hidden until it reconciles sales, receiving, transfers, adjustments, and returns consistently. Use Inventory History for live movement checks."
      returnHref="/procurement/inventory-history"
      returnLabel="Open Inventory History"
    />
  );
}
