import { Search, X } from "lucide-react";

import type { CountListController } from "../lib/use-count-list-controller";
import { ALL_STATUSES, STATUS_LABELS } from "../constants";
import { MiniSelect } from "./mini-select";

type CountListToolbarProps = {
  controller: CountListController;
};

export function CountListToolbar({ controller }: CountListToolbarProps) {
  return (
    <div className="border-b border-border bg-muted/30 px-5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => controller.setAllLocations(!controller.allLocations)}
          className={`h-7 rounded border px-2 text-[11px] font-medium transition-colors ${
            controller.allLocations
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {controller.allLocations ? "All Locations" : "Current Loc."}
        </button>

        <MiniSelect
          value={controller.statusFilter}
          onChange={controller.setStatusFilter}
          options={[
            { value: "all", label: "All Statuses" },
            ...ALL_STATUSES.map((status) => ({
              value: status,
              label: STATUS_LABELS[status]!,
            })),
          ]}
        />

        <div className="relative ml-auto">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60"
          />
          <input
            type="text"
            value={controller.searchQuery}
            onChange={(e) => controller.handleSearchChange(e.target.value)}
            placeholder="Search counts..."
            className="h-7 w-44 rounded border border-border bg-background pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>

        {controller.hasFilters && (
          <button
            onClick={controller.clearFilters}
            className="flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={10} />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
