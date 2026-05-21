import { Check, Store } from "lucide-react";
import type { LocationRow } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";

type QuickAddStockSectionProps = {
  allLocations: LocationRow[];
  enabledLocationIds: Set<string>;
  initialStock: string;
  isAllLocations: boolean;
  setInitialStock: (value: string) => void;
  setTrackInventory: (value: boolean) => void;
  toggleAllLocations: () => void;
  toggleLocation: (id: string) => void;
  trackInventory: boolean;
};

export function QuickAddStockSection({
  allLocations,
  enabledLocationIds,
  initialStock,
  isAllLocations,
  setInitialStock,
  setTrackInventory,
  toggleAllLocations,
  toggleLocation,
  trackInventory,
}: QuickAddStockSectionProps) {
  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-1.5">
        <div>
          <p className="text-[13px] font-medium text-foreground">Track Inventory</p>
          <p className="text-[11px] text-muted-foreground">Monitor stock levels for this item</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={trackInventory}
          onClick={() => setTrackInventory(!trackInventory)}
          className={cn(
            "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
            trackInventory ? "bg-primary" : "bg-border",
          )}
        >
          <span
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
              trackInventory ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {trackInventory && !isAllLocations && (
        <div>
          <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
            Initial Stock at Current Location
          </label>
          <input
            type="number"
            min="0"
            value={initialStock}
            onChange={(e) => setInitialStock(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          />
        </div>
      )}

      {isAllLocations && allLocations.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[12px] font-medium text-muted-foreground">
              Available at Locations
            </label>
            <button
              type="button"
              onClick={toggleAllLocations}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {enabledLocationIds.size === allLocations.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2">
            {allLocations.map((loc) => {
              const isOn = enabledLocationIds.has(loc.id);

              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => toggleLocation(loc.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    isOn ? "bg-background" : "opacity-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      isOn
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                  >
                    {isOn && <Check size={10} strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{loc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {loc.type === "WAREHOUSE" ? "Warehouse" : loc.type === "RETAIL" ? "Retail Store" : loc.type}
                      {loc.code ? ` · ${loc.code}` : ""}
                    </p>
                  </div>
                  <Store size={13} className={cn("shrink-0", isOn ? "text-muted-foreground" : "text-muted-foreground/40")} />
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {enabledLocationIds.size} of {allLocations.length} locations selected
          </p>
        </div>
      )}
    </>
  );
}
