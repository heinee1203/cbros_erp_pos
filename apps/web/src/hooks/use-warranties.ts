import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface WarrantyPolicy {
  id: string;
  name: string;
  brandId: string | null;
  categoryId: string | null;
  productId: string | null;
  durationMonths: number;
  durationKm: number | null;
  warrantyType: string;
  proratedFullMonths: number | null;
  coverageDescription: string | null;
  exclusions: string | null;
  requiresSerial: boolean;
  isActive: boolean;
}

export interface WarrantyRecord {
  id: string;
  productName: string;
  sku: string | null;
  customerName: string | null;
  customerId: string | null;
  serialNumber: string | null;
  quantity: number;
  purchaseDate: string;
  expiryDate: string;
  expiryKm: number | null;
  warrantyType: string;
  coverageDescription: string | null;
  exclusions: string | null;
  status: string;
  // Enriched from lookup
  daysRemaining?: number;
  isUnderWarranty?: boolean;
  message?: string;
}

export interface WarrantyClaim {
  id: string;
  claimNumber: string;
  claimDate: string;
  claimReason: string;
  claimDescription: string | null;
  mileageAtClaim: number | null;
  status: string;
  resolution: string | null;
  resolutionNotes: string | null;
  productName?: string;
  serialNumber?: string | null;
  customerName?: string | null;
}

// ── Hooks ──

export function useWarrantyPolicies(token: string | null, locationId: string | null) {
  return useQuery({
    queryKey: ["warranties", "policies"],
    queryFn: () => apiFetch<{ data: WarrantyPolicy[] }>("/warranties/policies", { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId,
  });
}

export function useCreatePolicy(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => apiFetch("/warranties/policies", { token: token!, locationId: locationId!, method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warranties", "policies"] }),
  });
}

export function useUpdatePolicy(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: any) => apiFetch(`/warranties/policies/${id}`, { token: token!, locationId: locationId!, method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warranties", "policies"] }),
  });
}

export function useWarrantyLookup(token: string | null, locationId: string | null, query: string, type: "serial" | "receiptNumber" | "customerId") {
  return useQuery({
    queryKey: ["warranties", "lookup", type, query],
    queryFn: () => apiFetch<{ records: WarrantyRecord[]; message: string }>(`/warranties/lookup?${type}=${encodeURIComponent(query)}`, { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId && query.length > 0,
  });
}

export function useWarrantyRecords(token: string | null, locationId: string | null, opts: Record<string, string> = {}) {
  const params = new URLSearchParams(opts);
  return useQuery({
    queryKey: ["warranties", "records", opts],
    queryFn: () => apiFetch<{ data: WarrantyRecord[]; nextCursor: string | null; hasMore: boolean }>(`/warranties/records?${params}`, { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId,
  });
}

export function useWarrantyClaims(token: string | null, locationId: string | null, opts: Record<string, string> = {}) {
  const params = new URLSearchParams(opts);
  return useQuery({
    queryKey: ["warranties", "claims", opts],
    queryFn: () => apiFetch<{ data: WarrantyClaim[]; nextCursor: string | null; hasMore: boolean }>(`/warranties/claims?${params}`, { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId,
  });
}

export function useCreateClaim(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => apiFetch("/warranties/claims", { token: token!, locationId: locationId!, method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warranties", "claims"] });
      qc.invalidateQueries({ queryKey: ["warranties", "records"] });
    },
  });
}

export function useResolveClaim(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: any) => apiFetch(`/warranties/claims/${id}`, { token: token!, locationId: locationId!, method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warranties", "claims"] });
      qc.invalidateQueries({ queryKey: ["warranties", "records"] });
    },
  });
}

export function useVoidWarranty(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiFetch(`/warranties/records/${id}/void`, { token: token!, locationId: locationId!, method: "POST", body: { reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warranties", "records"] }),
  });
}
