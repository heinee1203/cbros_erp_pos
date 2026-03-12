import { Receipt } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function ReceiptSettingsPage() {
  return (
    <PageShell
      icon={Receipt}
      title="Receipt & Invoice"
      description="Customize receipt and invoice templates, headers, footers, and company branding for printed and emailed documents."
      relatedHref="/sales/receipts"
      relatedLabel="View Receipts"
    />
  );
}
