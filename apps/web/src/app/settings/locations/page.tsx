import { MapPin } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function LocationsPage() {
  return (
    <PageShell
      icon={MapPin}
      title="Locations"
      description="Manage warehouse and retail store locations. Configure addresses, operating hours, and inventory settings per site."
      relatedHref="/procurement/stock-levels"
      relatedLabel="View Stock Levels"
    />
  );
}
