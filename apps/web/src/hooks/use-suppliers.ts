"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface SupplierRow {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  mnemonicCode: string | null;
}

export function useSuppliers(token: string, locationId: string) {
  return useQuery<{ data: SupplierRow[] }>({
    queryKey: ["suppliers"],
    queryFn: () =>
      apiFetch<{ data: SupplierRow[] }>("/procurement/suppliers", {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}
