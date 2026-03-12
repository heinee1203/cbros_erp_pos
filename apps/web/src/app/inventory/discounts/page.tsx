import { Percent } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function DiscountsPage() {
  return (
    <PageShell
      icon={Percent}
      title="Discounts"
      description="Discount rules and pricing tiers are coming soon. Create volume discounts, customer-specific pricing, and promotional offers."
      relatedHref="/inventory"
      relatedLabel="View Items"
    />
  );
}
