import { Shield } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function RolesPage() {
  return (
    <PageShell
      icon={Shield}
      title="Roles & Access"
      description="Define employee roles and permissions. Control access to POS, inventory, reports, and admin functions."
      relatedHref="/settings"
      relatedLabel="Manage in Settings"
    />
  );
}
