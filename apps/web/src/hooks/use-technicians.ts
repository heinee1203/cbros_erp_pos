"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ── Types ── */
export interface Technician {
  id: string;
  orgId: string;
  name: string;
  nickname: string | null;
  role: string | null;
  phone: string | null;
  commissionType: string;
  commissionRate: number;
  commissionRateAlt: number | null;
  locationId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTechnicianInput {
  name: string;
  nickname?: string;
  role?: string;
  phone?: string;
  commissionType?: string;
  commissionRate?: number;
  commissionRateAlt?: number | null;
  locationId?: string | null;
}

export interface UpdateTechnicianInput extends Partial<CreateTechnicianInput> {
  isActive?: boolean;
}

export interface CommissionRow {
  technicianId: string;
  name: string;
  nickname: string | null;
  role: string | null;
  locationId: string | null;
  commissionType: string;
  commissionRate: number;
  commissionRateAlt: number | null;
  jobCount: number;
  ownLaborRevenue: number;
  shopTotalLabor: number;
  fixedCommission: number;
  rateCommission: number;
  commission: number;
  formula: string;
}

export interface CommissionResponse {
  data: CommissionRow[];
  summary: { shopTotalLabor: number; totalCommission: number; technicianCount: number };
}

/* ── Hooks ── */
export function useTechnicians(token: string, locationId: string, opts: { active?: boolean } = {}) {
  const params = new URLSearchParams();
  if (opts.active !== undefined) params.set("active", String(opts.active));

  return useQuery<{ data: Technician[] }>({
    queryKey: ["technicians", opts.active, locationId],
    queryFn: () =>
      apiFetch<{ data: Technician[] }>(`/technicians?${params.toString()}`, { token, locationId }),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useCreateTechnician(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTechnicianInput) =>
      apiFetch<Technician>("/technicians", {
        token,
        locationId,
        method: "POST",
        body: input as any,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}

export function useUpdateTechnician(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTechnicianInput & { id: string }) =>
      apiFetch<Technician>(`/technicians/${id}`, {
        token,
        locationId,
        method: "PUT",
        body: input as any,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}

export function useDeleteTechnician(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/technicians/${id}`, { token, locationId, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}

export function useSeedTechnicians(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ seeded: number; message: string }>("/technicians/seed", {
        token,
        locationId,
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}

export function useSeedFromProducts(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ seeded: number; discovered: number; existing: number; message: string; names: string[] }>("/technicians/seed-from-products", {
        token,
        locationId,
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}

export function useBatchUpdateTechnicians(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; updates: { locationId?: string; commissionRate?: number; commissionType?: string } }) =>
      apiFetch<{ updated: number }>("/technicians/batch-update", {
        token,
        locationId,
        method: "POST",
        body: input as any,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}

export function useBackfillHistorical(token: string, locationId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number; message: string }>("/technicians/backfill-historical", {
        token,
        locationId,
        method: "POST",
      }),
  });
}

export function useCommissions(
  token: string,
  locationId: string,
  opts: { from: string; to: string; filterLocationId?: string; enabled?: boolean },
) {
  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);
  if (opts.filterLocationId) params.set("locationId", opts.filterLocationId);

  return useQuery<CommissionResponse>({
    queryKey: ["technician-commissions", opts.from, opts.to, opts.filterLocationId, locationId],
    queryFn: () =>
      apiFetch<CommissionResponse>(`/technicians/commissions?${params.toString()}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!opts.from && !!opts.to && (opts.enabled !== false),
    staleTime: 30_000,
  });
}
