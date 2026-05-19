"use client";

import { DemandByTagFilters } from "./components/demand-by-tag-filters";
import { DemandByTagHeader } from "./components/demand-by-tag-header";
import { DemandByTagTable } from "./components/demand-by-tag-table";
import { useDemandByTagController } from "./lib/use-demand-by-tag-controller";

export default function DemandByTagPage() {
  const controller = useDemandByTagController();

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <DemandByTagHeader
        totalApplications={controller.totalApplications}
        totalUnits={controller.totalUnits}
        mostInDemand={controller.mostInDemand}
      />
      <DemandByTagFilters controller={controller} />
      <DemandByTagTable controller={controller} />
    </div>
  );
}
