import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  engine: string | null;
  variant: string | null;
  bodyType: string | null;
  notes: string | null;
}

export interface VehicleProduct {
  productId: string;
  productName: string;
  productSku: string;
  compatId: string;
}

export function useVehiclesList(token: string | null, locationId: string | null, search?: string, make?: string) {
  const params = new URLSearchParams({ limit: "100" });
  if (search) params.set("search", search);
  if (make) params.set("make", make);
  return useQuery({
    queryKey: ["vehicles", search, make],
    queryFn: () => apiFetch<{ data: Vehicle[]; nextCursor: string | null; hasMore: boolean }>(`/vehicles?${params}`, { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId,
  });
}

export function useVehicleProducts(token: string | null, locationId: string | null, vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicles", vehicleId, "products"],
    queryFn: () => apiFetch<{ data: VehicleProduct[] }>(`/vehicles/${vehicleId}/products`, { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId && !!vehicleId,
  });
}

export function useCreateVehicle(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => apiFetch<Vehicle>("/vehicles", { token: token!, locationId: locationId!, method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useBulkApplyFitment(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { vehicleId: string; productIds: string[]; notes?: string }) =>
      apiFetch("/vehicles/bulk-apply", { token: token!, locationId: locationId!, method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteVehicle(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      apiFetch(`/vehicles/${id}${force ? "?force=true" : ""}`, { token: token!, locationId: locationId!, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useUnfitAllProducts(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      apiFetch(`/vehicles/${vehicleId}/unfit-all`, { token: token!, locationId: locationId!, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useBulkRemoveFitment(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { vehicleId: string; productIds: string[] }) =>
      apiFetch("/vehicles/bulk-remove", { token: token!, locationId: locationId!, method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
