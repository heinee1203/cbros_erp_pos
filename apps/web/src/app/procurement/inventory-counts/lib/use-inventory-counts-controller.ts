"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth-context";

export function useInventoryCountsController() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeCountId, setActiveCountId] = useState<string | null>(null);

  return {
    activeCountId,
    authLoading,
    closeActiveCount: () => setActiveCountId(null),
    createNewCount: () => router.push("/inventory/counts/new"),
    locationId,
    selectCount: setActiveCountId,
    token,
  };
}

export type InventoryCountsController = ReturnType<typeof useInventoryCountsController>;
