"use client";

import { useEffect, useState } from "react";

import type { SupplierOption } from "../types";
import { fetchBackorderSuppliers } from "./backorders-api";

type UseBackorderSuppliersArgs = {
  enabled: boolean;
  locationId: string | null | undefined;
  token: string | null | undefined;
};

export function useBackorderSuppliers({
  enabled,
  locationId,
  token,
}: UseBackorderSuppliersArgs) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  useEffect(() => {
    const tokenValue = token;
    const locationIdValue = locationId;
    if (!enabled || !tokenValue || !locationIdValue) return;
    const fetchToken: string = tokenValue;
    const fetchLocationId: string = locationIdValue;

    async function fetchSuppliers() {
      try {
        const data = await fetchBackorderSuppliers(fetchToken, fetchLocationId);
        setSuppliers(data);
      } catch {
        // Supplier options are non-critical until the user opens a supplier-dependent modal.
      }
    }

    void fetchSuppliers();
  }, [enabled, token, locationId]);

  return suppliers;
}
