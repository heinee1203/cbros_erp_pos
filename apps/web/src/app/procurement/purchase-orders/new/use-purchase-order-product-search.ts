"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { apiFetch } from "@/lib/api";
import type { ProductSearchResult } from "./types";

type UsePurchaseOrderProductSearchParams = {
  token: string | null | undefined;
  locationId: string | null | undefined;
};

export type PurchaseOrderProductSearchController = {
  productSearch: string;
  productResults: ProductSearchResult[];
  searchLoading: boolean;
  showDropdown: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  dropdownRef: RefObject<HTMLDivElement | null>;
  setProductSearch: (value: string) => void;
  setShowDropdown: (value: boolean) => void;
  clearAndFocusSearch: () => void;
};

export function usePurchaseOrderProductSearch({
  token,
  locationId,
}: UsePurchaseOrderProductSearchParams): PurchaseOrderProductSearchController {
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!productSearch.trim() || productSearch.trim().length < 2) {
      setProductResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch<{ data: ProductSearchResult[] }>(
          `/products?search=${encodeURIComponent(productSearch.trim())}&limit=10`,
          {
            token: token ?? undefined,
            locationId: locationId ?? undefined,
          },
        );
        setProductResults(res.data);
        setShowDropdown(true);
      } catch {
        setProductResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [productSearch, token, locationId]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clearAndFocusSearch = useCallback(() => {
    setProductSearch("");
    setShowDropdown(false);
    searchRef.current?.focus();
  }, []);

  return {
    productSearch,
    productResults,
    searchLoading,
    showDropdown,
    searchRef,
    dropdownRef,
    setProductSearch,
    setShowDropdown,
    clearAndFocusSearch,
  };
}
