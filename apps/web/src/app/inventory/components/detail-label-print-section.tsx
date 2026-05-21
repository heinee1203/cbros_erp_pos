"use client";

import { useState } from "react";
import { Minus, Plus, Printer } from "lucide-react";
import {
  buildShelfLabel,
  encodeCostMnemonic,
  SHELF_LABEL_PRESETS,
  type ShelfLabelSizeId,
} from "@apex/types";
import { getProductDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductRow } from "@/hooks/use-products";
import { openZplPreview, sendZplPrintJob } from "@/lib/zpl-print";

interface DetailLabelPrintSectionProps {
  cost: number;
  locationId: string;
  product: ProductRow;
  token: string;
}

export function DetailLabelPrintSection({
  cost,
  locationId,
  product,
  token,
}: DetailLabelPrintSectionProps) {
  const [printQty, setPrintQty] = useState(1);
  const [supplierCode, setSupplierCode] = useState(() => {
    if (!product.brandName) return "";
    const code = product.brandName.replace(/[aeiou\s]/gi, "");
    return code.length >= 2
      ? code.slice(0, 2).toUpperCase()
      : product.brandName.slice(0, 2).toUpperCase();
  });
  const [selectedLabelSize, setSelectedLabelSize] = useState<ShelfLabelSizeId>("50x30");
  const [printStatus, setPrintStatus] = useState<"idle" | "sending" | "ok" | "fail">("idle");

  const costPreview = cost > 0 ? encodeCostMnemonic(cost) + (supplierCode || "") : "";
  const selectedPreset = SHELF_LABEL_PRESETS.find((preset) => preset.id === selectedLabelSize) ?? SHELF_LABEL_PRESETS[0];

  const handlePrintLabel = async () => {
    if (!token || !locationId) return;
    setPrintStatus("sending");

    try {
      const zpl = buildShelfLabel({
        itemName: getProductDisplayName(product),
        barcodeData: product.barcode ?? product.sku ?? "",
        costPrice: cost,
        detailText: [product.brandName, product.sku || product.mnemonicSku].filter(Boolean).join(" / "),
        sku: product.sku || product.mnemonicSku,
        supplierCode: supplierCode || undefined,
        quantity: printQty,
      }, selectedPreset.config);

      const result = await sendZplPrintJob({ token, locationId, zpl });
      if (!result.printed) openZplPreview(zpl);
      setPrintStatus("ok");
    } catch {
      setPrintStatus("fail");
    }

    setTimeout(() => setPrintStatus("idle"), 2000);
  };

  return (
    <div className="space-y-2.5 border-t border-border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <label className="w-20 text-xs font-medium text-muted-foreground">Quantity</label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPrintQty(Math.max(1, printQty - 1))}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
            disabled={printQty <= 1}
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="number"
            min={1}
            max={99}
            value={printQty}
            onChange={(event) => setPrintQty(Math.max(1, parseInt(event.target.value) || 1))}
            className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center font-mono text-xs focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={() => setPrintQty(Math.min(99, printQty + 1))}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
            disabled={printQty >= 99}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="w-20 text-xs font-medium text-muted-foreground">Supplier</label>
        <input
          type="text"
          value={supplierCode}
          onChange={(event) => setSupplierCode(event.target.value.toUpperCase().slice(0, 4))}
          maxLength={4}
          placeholder="e.g. AZ"
          className="w-16 rounded border border-border bg-background px-2 py-0.5 text-center font-mono text-xs uppercase focus:border-primary focus:outline-none"
        />
        {costPreview && (
          <span className="font-mono text-[10px] text-muted-foreground">
            Cost code: <span className="font-semibold text-primary">{costPreview}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="w-20 text-xs font-medium text-muted-foreground">Label Size</label>
        <div className="flex gap-1.5">
          {SHELF_LABEL_PRESETS.map((size) => (
            <button
              key={size.id}
              onClick={() => setSelectedLabelSize(size.id)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold transition-colors",
                selectedLabelSize === size.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={handlePrintLabel}
        disabled={printStatus === "sending"}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold",
          printStatus === "ok"
            ? "bg-green-600 text-white"
            : printStatus === "fail"
              ? "bg-red-600 text-white"
              : "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50",
        )}
      >
        <Printer className="h-3.5 w-3.5" />
        {printStatus === "sending"
          ? "Sending..."
          : printStatus === "ok"
            ? "Sent!"
            : printStatus === "fail"
              ? "Failed"
              : `Print ${printQty} Label${printQty !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
