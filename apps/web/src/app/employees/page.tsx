import { UserCog } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function EmployeesPage() {
  return (
    <PageShell
      icon={UserCog}
      title="Employee List"
      description="Manage employee profiles, assigned locations, contact details, and employment status."
      relatedHref="/settings"
      relatedLabel="Manage in Settings"
    />
  );
}
