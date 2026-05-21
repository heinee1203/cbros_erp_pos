"use client";

import { MapPin } from "lucide-react";

import type { LocationInfo } from "@/app/auth-context";

import { FormSection } from "./form-controls";

type LocationAvailabilitySectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  locations: LocationInfo[];
  selectedLocations: Set<string>;
  onToggleLocation: (id: string) => void;
};

export function LocationAvailabilitySection({
  collapsed,
  onToggle,
  locations,
  selectedLocations,
  onToggleLocation,
}: LocationAvailabilitySectionProps) {
  return (
    <FormSection
      id="locations"
      icon={MapPin}
      title="Location Availability"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={`${selectedLocations.size} of ${locations.length}`}
    >
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th
                scope="col"
                className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Location
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Type
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Available
              </th>
            </tr>
          </thead>
          <tbody>
            {locations
              .filter((location) => location.isActive)
              .map((location) => (
                <tr
                  key={location.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {location.name}
                  </td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">
                    {location.type.toLowerCase().replace("_", " ")}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedLocations.has(location.id)}
                      onChange={() => onToggleLocation(location.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </FormSection>
  );
}
