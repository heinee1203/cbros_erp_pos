"use client";

import { useMemo } from "react";

import { useVehicleModels } from "@/hooks/use-vehicles";

import { fieldClass } from "./form-controls";

type NewPageModelInputProps = {
  token: string;
  locationId: string;
  make: string;
  value: string;
  onChange: (value: string) => void;
};

export function NewPageModelInput({
  token,
  locationId,
  make,
  value,
  onChange,
}: NewPageModelInputProps) {
  const { data: modelsData } = useVehicleModels(token, locationId, make);
  const listId = useMemo(
    () => `models-new-${make}-${Math.random().toString(36).slice(2, 8)}`,
    [make],
  );

  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. Civic"
        list={listId}
        className={fieldClass}
      />
      {modelsData?.data && modelsData.data.length > 0 && (
        <datalist id={listId}>
          {modelsData.data.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      )}
    </>
  );
}
