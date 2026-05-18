import type { Dispatch, SetStateAction } from "react";
import type { LocationOption, PreviewResponse } from "../types";

type ImportLocationMappingSectionProps = {
  locations: PreviewResponse["locationMapping"];
  orgLocations: LocationOption[];
  locationMapping: Record<string, string>;
  onLocationMappingChange: Dispatch<SetStateAction<Record<string, string>>>;
};

export function ImportLocationMappingSection({
  locations,
  orgLocations,
  locationMapping,
  onLocationMappingChange,
}: ImportLocationMappingSectionProps) {
  if (locations.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-5">
      <h3 className="mb-3 text-sm font-medium text-foreground">Location Mapping</h3>
      <div className="space-y-2">
        {locations.map((location) => (
          <div
            key={location.csvName}
            className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {location.csvName}
            </span>
            <span className="text-muted-foreground">&rarr;</span>
            <select
              value={locationMapping[location.csvName] ?? ""}
              onChange={(event) =>
                onLocationMappingChange((prev) => ({
                  ...prev,
                  [location.csvName]: event.target.value,
                }))
              }
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select location...</option>
              {orgLocations.map((orgLocation) => (
                <option key={orgLocation.id} value={orgLocation.id}>
                  {orgLocation.name}
                </option>
              ))}
            </select>
            {location.autoMatched && locationMapping[location.csvName] && (
              <span className="whitespace-nowrap text-[10px] text-emerald-600">✓ auto</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
