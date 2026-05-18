"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { getProductDisplayName } from "@/lib/format";
import type { CSVPreviewRow, POLineInput, ProductSearchResult } from "./types";
import { calculateNetCost } from "./utils";

export type PurchaseOrderLinesController = {
  lines: POLineInput[];
  setLines: Dispatch<SetStateAction<POLineInput[]>>;
  addProductLine: (product: ProductSearchResult) => void;
  addCsvProductLine: (product: ProductSearchResult, row: CSVPreviewRow) => void;
  updateLine: (
    localId: string,
    field: keyof POLineInput,
    value: string | number | boolean,
  ) => void;
  removeLine: (localId: string) => void;
  grandTotal: number;
};

export function usePurchaseOrderLines(): PurchaseOrderLinesController {
  const [lines, setLines] = useState<POLineInput[]>([]);

  const addProductLine = useCallback((product: ProductSearchResult) => {
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id
            ? { ...line, orderedQty: line.orderedQty + 1 }
            : line,
        );
      }

      const costPrice = product.costPrice || "0.00";
      return [
        ...prev,
        {
          localId: crypto.randomUUID(),
          productId: product.id,
          productName: getProductDisplayName(product),
          sku: product.sku,
          orderedQty: 1,
          listPrice: costPrice,
          discountChain: "",
          netCost: costPrice,
          isManualCost: false,
          unitsPerCase: product.unitsPerCase ?? 1,
          packagingUnit: product.packagingUnit ?? null,
          entryUnit: (product.unitsPerCase ?? 1) > 1 ? "case" : "piece",
          sellingUnit: product.sellingUnit ?? "piece",
          purchaseUnit: product.purchaseUnit ?? null,
          conversionFactor:
            parseFloat(String(product.conversionFactor ?? "1")) || 1,
        },
      ];
    });
  }, []);

  const addCsvProductLine = useCallback(
    (product: ProductSearchResult, row: CSVPreviewRow) => {
      setLines((prev) => {
        const existing = prev.find((line) => line.productId === product.id);
        if (existing) {
          return prev.map((line) =>
            line.productId === product.id
              ? { ...line, orderedQty: line.orderedQty + row.qty }
              : line,
          );
        }

        const listPrice =
          row.listPrice && parseFloat(row.listPrice) > 0
            ? row.listPrice
            : product.costPrice || "0.00";
        const discountChain = row.discount || "";
        const netCost = discountChain
          ? String(calculateNetCost(parseFloat(listPrice), discountChain))
          : listPrice;

        return [
          ...prev,
          {
            localId: crypto.randomUUID(),
            productId: product.id,
            productName: getProductDisplayName(product),
            sku: product.sku,
            orderedQty: row.qty,
            listPrice,
            discountChain,
            netCost,
            isManualCost: false,
            unitsPerCase: product.unitsPerCase ?? 1,
            packagingUnit: product.packagingUnit ?? null,
            entryUnit: "piece",
            sellingUnit: product.sellingUnit ?? "piece",
            purchaseUnit: product.purchaseUnit ?? null,
            conversionFactor:
              parseFloat(String(product.conversionFactor ?? "1")) || 1,
          },
        ];
      });
    },
    [],
  );

  const updateLine = useCallback(
    (
      localId: string,
      field: keyof POLineInput,
      value: string | number | boolean,
    ) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.localId !== localId) return line;
          const updated = { ...line, [field]: value };

          if (field === "orderedQty") {
            updated.orderedQty = Math.max(1, parseInt(String(value)) || 1);
          }

          if (field === "listPrice") {
            updated.listPrice = String(value);
            if (!updated.isManualCost) {
              const listPrice = parseFloat(String(value)) || 0;
              updated.netCost = String(
                calculateNetCost(listPrice, updated.discountChain) || value,
              );
            }
          }

          if (field === "discountChain") {
            updated.discountChain = String(value);
            const listPrice = parseFloat(updated.listPrice) || 0;
            const discountChain = String(value).trim();
            if (discountChain) {
              updated.netCost = String(
                calculateNetCost(listPrice, discountChain),
              );
              updated.isManualCost = false;
            } else if (!updated.isManualCost) {
              updated.netCost = updated.listPrice;
            }
          }

          if (field === "netCost" && !updated.discountChain.trim()) {
            updated.netCost = String(value);
            updated.isManualCost = true;
          }

          return updated;
        }),
      );
    },
    [],
  );

  const removeLine = useCallback((localId: string) => {
    setLines((prev) => prev.filter((line) => line.localId !== localId));
  }, []);

  const grandTotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + line.orderedQty * (parseFloat(line.netCost) || 0),
        0,
      ),
    [lines],
  );

  return {
    lines,
    setLines,
    addProductLine,
    addCsvProductLine,
    updateLine,
    removeLine,
    grandTotal,
  };
}
