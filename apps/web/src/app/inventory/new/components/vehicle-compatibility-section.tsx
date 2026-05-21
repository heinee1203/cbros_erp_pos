"use client";

import { Car, Copy, Info, Plus, Trash2 } from "lucide-react";

import type { VehicleEntry } from "../types";
import {
  FieldLabel,
  FormSection,
  fieldClass,
} from "./form-controls";
import { NewPageModelInput } from "./model-input";

type VehicleCompatibilitySectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  selectedFamilyEnum: string;
  vehicles: VehicleEntry[];
  allMakes: string[];
  token: string;
  locationId: string;
  onAddVehicle: () => void;
  onUpdateVehicle: (id: string, field: keyof VehicleEntry, value: string) => void;
  onRemoveVehicle: (id: string) => void;
  onCopyFromItem: () => void;
};

export function VehicleCompatibilitySection({
  collapsed,
  onToggle,
  selectedFamilyEnum,
  vehicles,
  allMakes,
  token,
  locationId,
  onAddVehicle,
  onUpdateVehicle,
  onRemoveVehicle,
  onCopyFromItem,
}: VehicleCompatibilitySectionProps) {
  const isOptionalFamily =
    selectedFamilyEnum === "LABOR_SERVICES" ||
    selectedFamilyEnum === "ACCESSORIES";

  return (
    <FormSection
      id="vehicles"
      icon={Car}
      title="Vehicle Compatibility"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={vehicles.length > 0 ? `${vehicles.length} entries` : undefined}
    >
      <div className="space-y-3">
        <VehicleCompatibilityHint optional={isOptionalFamily} />

        {vehicles.map((vehicle) => (
          <VehicleFitmentRow
            key={vehicle.id}
            vehicle={vehicle}
            allMakes={allMakes}
            token={token}
            locationId={locationId}
            onUpdate={onUpdateVehicle}
            onRemove={onRemoveVehicle}
          />
        ))}

        <div className="flex items-center gap-3">
          <button
            onClick={onAddVehicle}
            className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
          >
            <Plus size={13} />
            Add Vehicle Fitment
          </button>
          <button
            onClick={onCopyFromItem}
            className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-primary"
          >
            <Copy size={13} />
            Copy from Item
          </button>
        </div>
      </div>
    </FormSection>
  );
}

function VehicleCompatibilityHint({ optional }: { optional: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
      <Info size={13} />
      <span>
        {optional
          ? "Vehicle compatibility is typically used for Hard Parts and Tires. You can still add entries if needed."
          : "Specify which vehicles this part fits. This data is persisted and searchable."}
      </span>
    </div>
  );
}

function VehicleFitmentRow({
  vehicle,
  allMakes,
  token,
  locationId,
  onUpdate,
  onRemove,
}: {
  vehicle: VehicleEntry;
  allMakes: string[];
  token: string;
  locationId: string;
  onUpdate: (id: string, field: keyof VehicleEntry, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Fitment Entry
        </span>
        <button
          onClick={() => onRemove(vehicle.id)}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div>
          <FieldLabel>Make</FieldLabel>
          <select
            value={vehicle.make}
            onChange={(event) => onUpdate(vehicle.id, "make", event.target.value)}
            className={fieldClass}
          >
            <option value="">Select{"\u2026"}</option>
            {allMakes.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Model</FieldLabel>
          <NewPageModelInput
            token={token}
            locationId={locationId}
            make={vehicle.make}
            value={vehicle.model}
            onChange={(value) => onUpdate(vehicle.id, "model", value)}
          />
        </div>
        <div>
          <FieldLabel>Year From</FieldLabel>
          <input
            type="number"
            min="1990"
            max="2030"
            value={vehicle.yearStart}
            onChange={(event) =>
              onUpdate(vehicle.id, "yearStart", event.target.value)
            }
            placeholder="2016"
            className={fieldClass}
          />
        </div>
        <div>
          <FieldLabel>Year To</FieldLabel>
          <input
            type="number"
            min="1990"
            max="2030"
            value={vehicle.yearEnd}
            onChange={(event) =>
              onUpdate(vehicle.id, "yearEnd", event.target.value)
            }
            placeholder="2021"
            className={fieldClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Engine / Application</FieldLabel>
          <input
            type="text"
            value={vehicle.engine}
            onChange={(event) =>
              onUpdate(vehicle.id, "engine", event.target.value)
            }
            placeholder="e.g. 1.5L Turbo"
            className={fieldClass}
          />
        </div>
        <div>
          <FieldLabel>Fitment Notes</FieldLabel>
          <input
            type="text"
            value={vehicle.notes}
            onChange={(event) =>
              onUpdate(vehicle.id, "notes", event.target.value)
            }
            placeholder="e.g. Front only, OEM replacement"
            className={fieldClass}
          />
        </div>
      </div>
    </div>
  );
}
