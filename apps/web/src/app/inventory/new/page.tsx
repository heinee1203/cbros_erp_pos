"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Check } from "lucide-react";

import { useAuth } from "@/app/auth-context";
import { useSidebar } from "@/app/sidebar-context";

import { AttributesSection } from "./components/attributes-section";
import { BasicInfoSection } from "./components/basic-info-section";
import { CopyFitmentModal } from "./components/copy-fitment-modal";
import { InventoryBehaviorSection } from "./components/inventory-behavior-section";
import { LocationAvailabilitySection } from "./components/location-availability-section";
import { NewItemActionBar } from "./components/new-item-action-bar";
import { PricingSection } from "./components/pricing-section";
import { VariantSetupSection } from "./components/variant-setup-section";
import { VehicleCompatibilitySection } from "./components/vehicle-compatibility-section";
import { useNewInventoryItemForm } from "./use-new-inventory-item-form";

export default function AddItemPage() {
  const router = useRouter();
  const { token, locationId, user, locations } = useAuth();
  const { isCollapsed } = useSidebar();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  const form = useNewInventoryItemForm({
    token,
    locationId,
    role: user?.role,
    locations,
    onCreated: () => router.push("/inventory"),
  });

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/inventory")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Add New Item
            </h2>
            <p className="text-[12px] text-muted-foreground">
              Full item setup - catalog, pricing, inventory, and compatibility
            </p>
          </div>
        </div>
      </div>

      {form.status.error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertCircle size={14} />
          {form.status.error}
        </div>
      )}
      {form.status.successMessage && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-[12px] text-success">
          <Check size={14} />
          {form.status.successMessage}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pb-20">
        <BasicInfoSection
          collapsed={collapsedSections.has("basic")}
          onToggle={() => toggleSection("basic")}
          {...form.basic}
        />

        <PricingSection
          collapsed={collapsedSections.has("pricing")}
          onToggle={() => toggleSection("pricing")}
          {...form.pricing}
        />

        <InventoryBehaviorSection
          collapsed={collapsedSections.has("inventory")}
          onToggle={() => toggleSection("inventory")}
          {...form.inventory}
        />

        <LocationAvailabilitySection
          collapsed={collapsedSections.has("locations")}
          onToggle={() => toggleSection("locations")}
          {...form.locations}
        />

        <VariantSetupSection
          collapsed={collapsedSections.has("variants")}
          onToggle={() => toggleSection("variants")}
          {...form.variants}
        />

        {!form.status.hasVariants && (
          <AttributesSection
            collapsed={collapsedSections.has("attributes")}
            onToggle={() => toggleSection("attributes")}
            {...form.attributes}
          />
        )}

        <VehicleCompatibilitySection
          collapsed={collapsedSections.has("vehicles")}
          onToggle={() => toggleSection("vehicles")}
          {...form.vehicles}
        />
      </div>

      <CopyFitmentModal {...form.fitmentModal} />

      <NewItemActionBar
        isCollapsed={isCollapsed}
        isValid={form.status.isValid}
        isSaving={form.status.isSaving}
        savingStep={form.status.savingStep}
        onCancel={() => router.push("/inventory")}
        onSave={form.actions.handleSave}
      />
    </div>
  );
}
