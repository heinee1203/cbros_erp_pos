"use client";

import { Loader2 } from "lucide-react";

import { CountDetailView } from "./components/count-detail-view";
import { CountListView } from "./components/count-list-view";
import { useInventoryCountsController } from "./lib/use-inventory-counts-controller";

export default function InventoryCountsPage() {
  const controller = useInventoryCountsController();

  if (controller.authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (controller.activeCountId) {
    return (
      <CountDetailView
        token={controller.token}
        locationId={controller.locationId}
        countId={controller.activeCountId}
        onBack={controller.closeActiveCount}
      />
    );
  }

  return (
    <CountListView
      token={controller.token}
      locationId={controller.locationId}
      onSelectCount={controller.selectCount}
      onCreateNew={controller.createNewCount}
    />
  );
}
