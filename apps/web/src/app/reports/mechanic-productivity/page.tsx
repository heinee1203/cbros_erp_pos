"use client";

import { MechanicProductivityFilters } from "./components/mechanic-productivity-filters";
import { MechanicProductivityHeader } from "./components/mechanic-productivity-header";
import { MechanicProductivityTable } from "./components/mechanic-productivity-table";
import { useMechanicProductivityController } from "./lib/use-mechanic-productivity-controller";

export default function MechanicProductivityPage() {
  const controller = useMechanicProductivityController();

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <MechanicProductivityHeader controller={controller} />
      <MechanicProductivityFilters controller={controller} />
      <MechanicProductivityTable controller={controller} />
    </div>
  );
}
