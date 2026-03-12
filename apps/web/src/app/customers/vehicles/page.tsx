import { Car } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function CustomerVehiclesPage() {
  return (
    <PageShell
      icon={Car}
      title="Customer Vehicles"
      description="Track customer vehicles by make, model, year, and VIN. Link service history and parts purchases to specific vehicles."
      relatedHref="/customers"
      relatedLabel="View Customers"
    />
  );
}
