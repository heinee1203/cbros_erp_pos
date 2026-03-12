import { ShoppingCart } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function PosSettingsPage() {
  return (
    <PageShell
      icon={ShoppingCart}
      title="POS Settings"
      description="Configure point of sale behavior — default tax rates, rounding rules, payment methods, and receipt options."
      relatedHref="/pos"
      relatedLabel="Go to POS"
    />
  );
}
