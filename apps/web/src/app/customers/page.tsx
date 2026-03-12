import { Users } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function CustomersPage() {
  return (
    <PageShell
      icon={Users}
      title="Customer List"
      description="Manage customer profiles, contact information, purchase history, and loyalty status across all locations."
    />
  );
}
