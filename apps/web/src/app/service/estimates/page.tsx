import { FileText } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function EstimatesPage() {
  return (
    <PageShell
      icon={FileText}
      title="Estimates"
      description="Create and manage repair estimates for customers. Include parts, labor, and generate approval-ready quotes."
      relatedHref="/service/job-cards"
      relatedLabel="View Job Cards"
    />
  );
}
