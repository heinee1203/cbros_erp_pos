"use client";

import { useCallback, useEffect, useState } from "react";

import type { ProductSearchResult } from "../types";
import { searchBackorderProducts } from "./backorders-api";

type UseBackorderProductSearchArgs = {
  locationId: string | null | undefined;
  token: string | null | undefined;
};

export function useBackorderProductSearch({
  locationId,
  token,
}: UseBackorderProductSearchArgs) {
  const [newProductSearch, setNewProductSearch] = useState("");
  const [newProductResults, setNewProductResults] = useState<
    ProductSearchResult[]
  >([]);
  const [newSelectedProduct, setNewSelectedProduct] =
    useState<ProductSearchResult | null>(null);
  const [productSearchLoading, setProductSearchLoading] = useState(false);

  useEffect(() => {
    if (!newProductSearch.trim() || !token || !locationId) {
      setNewProductResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const data = await searchBackorderProducts(
          token,
          locationId,
          newProductSearch.trim(),
        );
        setNewProductResults(data);
      } catch {
        setNewProductResults([]);
      } finally {
        setProductSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newProductSearch, token, locationId]);

  const resetProductSearch = useCallback(() => {
    setNewProductSearch("");
    setNewProductResults([]);
    setNewSelectedProduct(null);
  }, []);

  return {
    newProductResults,
    newProductSearch,
    newSelectedProduct,
    productSearchLoading,
    resetProductSearch,
    setNewProductResults,
    setNewProductSearch,
    setNewSelectedProduct,
  };
}
