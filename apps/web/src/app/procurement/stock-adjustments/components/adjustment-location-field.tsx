import type { LocationInfo } from "@/app/auth-context";

type AdjustmentLocationFieldProps = {
  disabled: boolean;
  locations: LocationInfo[];
  selectedLocation: string;
  onLocationChange: (value: string) => void;
};

export function AdjustmentLocationField({
  disabled,
  locations,
  selectedLocation,
  onLocationChange,
}: AdjustmentLocationFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Location
      </label>
      <select
        value={selectedLocation}
        onChange={(e) => onLocationChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
      >
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </div>
  );
}
