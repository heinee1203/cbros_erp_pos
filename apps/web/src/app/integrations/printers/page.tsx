import { Printer } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function PrintersPage() {
  return (
    <PageShell
      icon={Printer}
      title="Printers"
      description="Configure receipt printers, label printers, and invoice printers for each location."
    />
  );
}
