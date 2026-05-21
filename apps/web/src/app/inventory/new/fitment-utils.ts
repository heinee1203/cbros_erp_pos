import type { VehicleEntry } from "./types";

function fitmentKey(vehicle: VehicleEntry) {
  return `${vehicle.make}|${vehicle.model}|${vehicle.yearStart}|${vehicle.yearEnd}`;
}

export function mergeCopiedFitments(
  existingEntries: VehicleEntry[],
  copiedEntries: VehicleEntry[],
) {
  const existing = new Set(existingEntries.map(fitmentKey));
  const deduplicated = copiedEntries.filter(
    (vehicle) => !existing.has(fitmentKey(vehicle)),
  );

  return {
    entries: [...existingEntries, ...deduplicated],
    copiedCount: deduplicated.length,
    skippedCount: copiedEntries.length - deduplicated.length,
  };
}
