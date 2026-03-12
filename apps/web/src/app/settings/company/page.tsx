import { Building2 } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function CompanyProfilePage() {
  return (
    <PageShell
      icon={Building2}
      title="Company Profile"
      description="Update company name, logo, tax ID, currency, timezone, and other business-level settings."
    />
  );
}
