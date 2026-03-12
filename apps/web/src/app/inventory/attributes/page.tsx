import { SlidersHorizontal } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function AttributesPage() {
  return (
    <PageShell
      icon={SlidersHorizontal}
      title="Attributes"
      description="Product attributes and vehicle fitment management is coming soon. Define specifications, compatibility, and variant options."
      relatedHref="/inventory"
      relatedLabel="View Items"
    />
  );
}
