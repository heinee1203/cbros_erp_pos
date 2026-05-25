import { UnavailableFeaturePage } from "@/components/unavailable-feature-page";

export default function CustomerVehiclesPage() {
  return (
    <UnavailableFeaturePage
      title="Customer Vehicles"
      description="Vehicle tracking is hidden from navigation until it supports real customer repair history and parts lookup. Use the customer account workspace for active AR and profile work."
      returnHref="/customers"
      returnLabel="Back to Customers"
    />
  );
}
