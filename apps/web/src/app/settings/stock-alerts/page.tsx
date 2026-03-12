import { Bell } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function StockAlertsPage() {
  return (
    <PageShell
      icon={Bell}
      title="Stock Alerts"
      description="Configure low-stock notifications, reorder point thresholds, and alert delivery preferences per category or item."
      relatedHref="/procurement/stock-levels"
      relatedLabel="View Stock Levels"
    />
  );
}
