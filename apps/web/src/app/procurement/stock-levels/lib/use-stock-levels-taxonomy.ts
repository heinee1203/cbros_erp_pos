"use client";

import { useMemo } from "react";
import { useCategories, type CategoryRow } from "@/hooks/use-categories";
import { useProductFamilies, type ProductFamily } from "@/hooks/use-products";
import { useSubcategories, type SubcategoryRow } from "@/hooks/use-subcategories";

type UseStockLevelsTaxonomyArgs = {
  categoryFilter: string;
  familyFilter: string;
  locationId: string | null | undefined;
  token: string | null | undefined;
};

type StockLevelsTaxonomy = {
  allCategories: CategoryRow[];
  allFamilies: ProductFamily[];
  filteredCategories: CategoryRow[];
  filteredSubcategories: SubcategoryRow[];
};

export function useStockLevelsTaxonomy({
  categoryFilter,
  familyFilter,
  locationId,
  token,
}: UseStockLevelsTaxonomyArgs): StockLevelsTaxonomy {
  const familiesQuery = useProductFamilies(token ?? "", locationId ?? "");
  const categoriesQuery = useCategories(token ?? "", locationId ?? "", {});
  const subcategoriesQuery = useSubcategories(token ?? "", locationId ?? "");

  const allFamilies = familiesQuery.data?.data ?? [];
  const allCategories = categoriesQuery.data?.data ?? [];
  const allSubcategories = subcategoriesQuery.data?.data ?? [];

  const filteredCategories = useMemo(
    () =>
      familyFilter !== "all"
        ? allCategories.filter((category) => category.familyId === familyFilter)
        : allCategories,
    [allCategories, familyFilter],
  );

  const filteredSubcategories = useMemo(
    () =>
      categoryFilter !== "all"
        ? allSubcategories.filter(
            (subcategory) => subcategory.categoryId === categoryFilter,
          )
        : allSubcategories,
    [allSubcategories, categoryFilter],
  );

  return {
    allCategories,
    allFamilies,
    filteredCategories,
    filteredSubcategories,
  };
}
