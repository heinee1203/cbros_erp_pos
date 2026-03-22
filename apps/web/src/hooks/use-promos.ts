import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface PromoRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  priority: number;
  maxUsesTotal: number | null;
  maxUsesPerSale: number;
  usesCount: number;
  requiresApproval: boolean;
  triggers: Array<{
    id: string;
    triggerType: string;
    triggerId: string | null;
    minQuantity: number;
  }>;
  rewards: Array<{
    id: string;
    rewardType: string;
    productId: string | null;
    productName: string | null;
    quantity: number;
    discountPercent: string | null;
    discountAmount: string | null;
    fixedPrice: string | null;
    appliesTo: string;
  }>;
}

export function usePromos(token: string | null, locationId: string | null) {
  return useQuery({
    queryKey: ["promos"],
    queryFn: () => apiFetch<{ data: PromoRule[] }>("/promos", { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId,
  });
}

export function useCreatePromo(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => apiFetch("/promos", { token: token!, locationId: locationId!, method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promos"] }),
  });
}

export function useUpdatePromo(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: any) => apiFetch(`/promos/${id}`, { token: token!, locationId: locationId!, method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promos"] }),
  });
}

export function useDeactivatePromo(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/promos/${id}`, { token: token!, locationId: locationId!, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promos"] }),
  });
}
