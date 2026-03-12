import { ArrowUpDown } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function ImportExportPage() {
  return (
    <PageShell
      icon={ArrowUpDown}
      title="Import / Export"
      description="Bulk import products, customers, and inventory from CSV. Export data for accounting, reporting, or migration."
      relatedHref="/inventory"
      relatedLabel="Browse Inventory"
    />
  );
}
