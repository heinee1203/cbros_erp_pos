import { UnavailableFeaturePage } from "@/components/unavailable-feature-page";

export default function EstimatesPage() {
  return (
    <UnavailableFeaturePage
      title="Service Estimates"
      description="Estimate creation is hidden until it can create approval-ready quotes without bypassing the active service and billing flow."
      returnHref="/service/job-cards"
      returnLabel="Open Job Cards"
    />
  );
}
