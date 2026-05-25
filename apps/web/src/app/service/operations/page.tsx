import { UnavailableFeaturePage } from "@/components/unavailable-feature-page";

export default function ServiceOperationsPage() {
  return (
    <UnavailableFeaturePage
      title="Service Operations"
      description="Standard service-operation setup is not operational yet. For now, service work should be handled through job cards so operators do not create incomplete labor templates."
      returnHref="/service/job-cards"
      returnLabel="Open Job Cards"
    />
  );
}
