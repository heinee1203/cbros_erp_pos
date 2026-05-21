"use client";

import { useCreateBrand } from "@/hooks/use-brands";
import { useCreateCategory } from "@/hooks/use-categories";
import { useCreateFamily } from "@/hooks/use-families";
import { useCreateSubcategory } from "@/hooks/use-subcategories";

interface UseInventoryQuickCreateOptions {
  token: string | null;
  apiLocationId: string | null;
}

export function useInventoryQuickCreate({
  token,
  apiLocationId,
}: UseInventoryQuickCreateOptions) {
  return {
    createBrand: useCreateBrand(token!, apiLocationId!),
    createCategory: useCreateCategory(token!, apiLocationId!),
    createFamily: useCreateFamily(token!, apiLocationId!),
    createSubcategory: useCreateSubcategory(token!, apiLocationId!),
  };
}

export type InventoryQuickCreateController = ReturnType<typeof useInventoryQuickCreate>;
