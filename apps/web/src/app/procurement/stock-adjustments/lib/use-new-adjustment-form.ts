"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdjustmentReasonCode,
  NEGATIVE_ONLY_REASON_CODES,
  POSITIVE_ONLY_REASON_CODES,
  RESTRICTED_REASON_CODES,
} from "@apex/types";

import { useAdjustmentMutation } from "@/hooks/use-adjustment-mutation";
import {
  useProductSearch,
  type ProductSearchResult,
} from "@/hooks/use-product-search";

export type AdjustmentDirection = "IN" | "OUT" | "";

type UseNewAdjustmentFormArgs = {
  locationId: string;
  onClose: () => void;
  token: string;
};

export function useNewAdjustmentForm({
  locationId,
  onClose,
  token,
}: UseNewAdjustmentFormArgs) {
  const [selectedLocation, setSelectedLocation] = useState(locationId);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] =
    useState<ProductSearchResult | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [direction, setDirection] = useState<AdjustmentDirection>("");
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const productSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const { submit, status, statusMessage, isSubmitting, reset } =
    useAdjustmentMutation(token, selectedLocation);

  const productSearchQuery = useProductSearch(
    token,
    selectedLocation,
    debouncedProductSearch,
  );
  const productResults = productSearchQuery.data?.data ?? [];

  const availableReasonCodes = useMemo(() => {
    if (direction === "IN") {
      return [...POSITIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    }
    if (direction === "OUT") {
      return [...NEGATIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    }
    return [];
  }, [direction]);

  useEffect(() => {
    setReasonCode("");
  }, [direction]);

  useEffect(
    () => () => {
      if (productSearchTimeoutRef.current) {
        clearTimeout(productSearchTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (status === "success" || status === "already_processed") {
      const timer = setTimeout(() => {
        reset();
        onClose();
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onClose]);

  const notesRequired =
    direction === "OUT" ||
    RESTRICTED_REASON_CODES.includes(reasonCode as AdjustmentReasonCode);

  const quantityNum = Number(quantity);
  const isValid =
    selectedProduct !== null &&
    direction !== "" &&
    quantityNum >= 1 &&
    reasonCode !== "" &&
    (!notesRequired || notes.trim().length > 0);

  const available = selectedProduct?.stockLevel ?? 0;
  const showOverstockWarning =
    direction === "OUT" && selectedProduct !== null && quantityNum > available;

  const handleProductSearch = useCallback((value: string) => {
    setProductSearch(value);
    if (productSearchTimeoutRef.current) {
      clearTimeout(productSearchTimeoutRef.current);
    }
    productSearchTimeoutRef.current = setTimeout(
      () => setDebouncedProductSearch(value),
      300,
    );
  }, []);

  const selectProduct = useCallback((product: ProductSearchResult) => {
    setSelectedProduct(product);
    setProductSearch(product.name);
    setShowProductDropdown(false);
  }, []);

  const clearProduct = useCallback(() => {
    setSelectedProduct(null);
    setProductSearch("");
    setDebouncedProductSearch("");
    setDirection("");
    setReasonCode("");
    setQuantity("");
    setNotes("");
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!isValid || isSubmitting || !selectedProduct) return;

      submit({
        productId: selectedProduct.id,
        locationId: selectedLocation,
        quantity: quantityNum,
        direction: direction as "IN" | "OUT",
        reasonCode: reasonCode as AdjustmentReasonCode,
        notes: notes.trim() || undefined,
      });
    },
    [
      direction,
      isSubmitting,
      isValid,
      notes,
      quantityNum,
      reasonCode,
      selectedLocation,
      selectedProduct,
      submit,
    ],
  );

  return {
    available,
    availableReasonCodes,
    clearProduct,
    debouncedProductSearch,
    direction,
    handleProductSearch,
    handleSubmit,
    isSubmitting,
    isValid,
    notes,
    notesRequired,
    productResults,
    productSearch,
    productSearchQuery,
    quantity,
    reasonCode,
    selectedLocation,
    selectedProduct,
    selectProduct,
    setDirection,
    setNotes,
    setQuantity,
    setReasonCode,
    setSelectedLocation,
    setShowProductDropdown,
    showOverstockWarning,
    showProductDropdown,
    status,
    statusMessage,
  };
}
