import { Smartphone } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function DevicesPage() {
  return (
    <PageShell
      icon={Smartphone}
      title="Devices & Scanners"
      description="Register and manage barcode scanners, tablets, and POS terminals connected to your locations."
    />
  );
}
