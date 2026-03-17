"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { ProductRow } from "@/hooks/use-products";

export function useVehicleMakes(token: string, locationId: string) {
  return useQuery<{ data: string[] }>({
    queryKey: ["vehicle-makes"],
    queryFn: () =>
      apiFetch("/products/vehicles/makes", { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 5 * 60_000,
  });
}

export function useVehicleModels(
  token: string,
  locationId: string,
  make: string,
) {
  return useQuery<{ data: string[] }>({
    queryKey: ["vehicle-models", make],
    queryFn: () =>
      apiFetch(
        `/products/vehicles/models?make=${encodeURIComponent(make)}`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!make,
    staleTime: 5 * 60_000,
  });
}

export function useVehicleEngines(token: string, locationId: string, make?: string) {
  const params = make ? `?make=${encodeURIComponent(make)}` : "";
  return useQuery<{ data: string[] }>({
    queryKey: ["vehicle-engines", make],
    queryFn: () => apiFetch(`/products/vehicles/engines${params}`, { token, locationId }),
    enabled: !!token,
    staleTime: 120_000,
  });
}

export interface VehicleSearchParams {
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  oem?: string;
}

interface VehicleSearchResponse {
  data: ProductRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function useVehicleSearch(
  token: string,
  locationId: string,
  params: VehicleSearchParams,
  options?: { enabled?: boolean },
) {
  const urlParams = new URLSearchParams();
  if (params.make) urlParams.set("vehicleMake", params.make);
  if (params.model) urlParams.set("vehicleModel", params.model);
  if (params.year) urlParams.set("vehicleYear", params.year);
  if (params.engine) urlParams.set("vehicleEngine", params.engine);
  if (params.oem) urlParams.set("oemNumber", params.oem);
  urlParams.set("limit", "500");

  const hasAnyFilter = !!(params.make || params.model || params.year || params.engine || params.oem);

  return useQuery<VehicleSearchResponse>({
    queryKey: ["vehicle-search", params.make, params.model, params.year, params.engine, params.oem, locationId],
    queryFn: () => apiFetch(`/products?${urlParams.toString()}`, { token, locationId }),
    enabled: (options?.enabled ?? true) && !!token && hasAnyFilter,
    staleTime: 30_000,
  });
}
