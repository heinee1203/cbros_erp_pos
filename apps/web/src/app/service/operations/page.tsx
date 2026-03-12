import { Cog } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function ServiceOperationsPage() {
  return (
    <PageShell
      icon={Cog}
      title="Service Operations"
      description="Configure standard service operations, labor rates, and estimated times for common repair and maintenance tasks."
      relatedHref="/service/job-cards"
      relatedLabel="View Job Cards"
    />
  );
}
