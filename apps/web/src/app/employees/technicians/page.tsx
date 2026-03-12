import { Wrench } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function TechniciansPage() {
  return (
    <PageShell
      icon={Wrench}
      title="Technicians"
      description="Manage service bay technicians, certifications, specializations, and hourly rate configurations."
      relatedHref="/service/job-cards"
      relatedLabel="View Job Cards"
    />
  );
}
