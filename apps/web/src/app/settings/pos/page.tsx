import { UnavailableFeaturePage } from "@/components/unavailable-feature-page";

export default function PosSettingsPage() {
  return (
    <UnavailableFeaturePage
      title="POS Settings"
      description="POS behavior settings are hidden until they are connected to the actual register configuration. This avoids operators changing values that the POS does not yet honor."
      returnHref="/settings"
      returnLabel="Back to Settings"
    />
  );
}
