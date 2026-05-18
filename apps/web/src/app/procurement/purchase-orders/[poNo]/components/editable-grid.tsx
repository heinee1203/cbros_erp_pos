"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { Trash2 } from "lucide-react";
import type { ProductRow } from "@/hooks/use-products";
import { calculateNetCost, parseDiscountExpression } from "../pricing-utils";
import { ProductSearchInline } from "./product-search-inline";
import { SectionHeader, Th } from "./shared";

export function EditableGrid({
  lines,
  setEditLines,
  isPartiallyReceived,
  onRemoveLine,
  onAddLine,
  grandTotal,
}: {
  lines: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    orderedQty: number;
    listPrice: string;
    discountChain: string;
    unitCost: string;
    isManualCost: boolean;
    receivedAcceptedQty: number;
    rejectedQty: number;
    isNew?: boolean;
  }>;
  setEditLines: Dispatch<SetStateAction<any[]>>;
  isPartiallyReceived: boolean;
  onRemoveLine: (lineId: string, isNew?: boolean) => void;
  onAddLine: (product: ProductRow) => void;
  grandTotal: number;
}) {
  const updateField = useCallback(
    (lineId: string, field: string, value: any) => {
      setEditLines((prev: any[]) =>
        prev.map((l: any) => {
          if (l.id !== lineId) return l;
          if (field === "listPrice") {
            const newListPrice = value;
            if (!l.isManualCost && l.discountChain.trim()) {
              const net = calculateNetCost(parseFloat(newListPrice) || 0, l.discountChain);
              return { ...l, listPrice: newListPrice, unitCost: String(net) };
            }
            return { ...l, listPrice: newListPrice };
          }
          if (field === "discountChain") {
            const newChain = value;
            const lp = parseFloat(l.listPrice) || 0;
            if (newChain.trim() && lp > 0) {
              const net = calculateNetCost(lp, newChain);
              return { ...l, discountChain: newChain, unitCost: String(net), isManualCost: false };
            }
            return { ...l, discountChain: newChain };
          }
          if (field === "unitCost") {
            return { ...l, unitCost: value, isManualCost: true, discountChain: "" };
          }
          if (field === "orderedQty") {
            return { ...l, orderedQty: value };
          }
          return { ...l, [field]: value };
        }),
      );
    },
    [setEditLines],
  );

  return (
    <section>
      <SectionHeader>
        Line Items
        <span className="ml-2 text-[10px] font-normal text-amber-600">
          (editing — {lines.length} line{lines.length !== 1 ? "s" : ""})
        </span>
      </SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-primary/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <Th align="left">Item</Th>
              <Th align="right">Qty</Th>
              <Th align="right">List Price</Th>
              <Th align="right">Discount</Th>
              <Th align="right">Net Cost</Th>
              <Th align="right">Total</Th>
              <th className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const lineTotal = line.orderedQty * (parseFloat(line.unitCost) || 0);
              const isReceived = line.receivedAcceptedQty > 0 || line.rejectedQty > 0;
              const isLocked = isPartiallyReceived && isReceived;
              const hasDiscount = line.discountChain.trim().length > 0;

              return (
                <tr
                  key={line.id}
                  className={`border-b border-border ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  } ${isLocked ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-1.5">
                    <div className="text-sm font-medium">
                      {(line as any).parentName ? `${(line as any).parentName} (${line.productName})` : line.productName}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {line.sku}
                    </div>
                    {isLocked && (
                      <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                        Received — locked
                      </div>
                    )}
                  </td>
                  {/* Qty */}
                  <td className="px-2 py-1.5 text-right">
                    {isLocked ? (
                      <span className="tabular-nums font-medium">
                        {line.orderedQty}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        value={line.orderedQty}
                        onChange={(e) =>
                          updateField(line.id, "orderedQty", parseInt(e.target.value) || 1)
                        }
                        className="h-7 w-20 rounded border border-border bg-background px-2 text-right text-[12px] tabular-nums outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                      />
                    )}
                  </td>
                  {/* List Price */}
                  <td className="px-2 py-1.5 text-right">
                    {isLocked ? (
                      <span className="tabular-nums text-muted-foreground">
                        {line.listPrice}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={line.listPrice}
                        onChange={(e) =>
                          updateField(line.id, "listPrice", e.target.value)
                        }
                        className="h-7 w-24 rounded border border-border bg-background px-2 text-right text-[12px] tabular-nums outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                      />
                    )}
                  </td>
                  {/* Discount Chain */}
                  <td className="px-2 py-1.5 text-right">
                    {isLocked ? (
                      <span className="tabular-nums text-muted-foreground">
                        {line.discountChain
                          ? line.discountChain.split(",").map((s) => s.trim()).join("/")
                          : "\u2014"}
                      </span>
                    ) : (
                      <input
                        type="text"
                        placeholder="20, 5, 3"
                        value={line.discountChain}
                        onChange={(e) =>
                          updateField(line.id, "discountChain", e.target.value)
                        }
                        className="h-7 w-24 rounded border border-border bg-background px-2 text-right text-[12px] tabular-nums outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                      />
                    )}
                  </td>
                  {/* Net Cost */}
                  <td className="px-2 py-1.5 text-right">
                    {isLocked ? (
                      <span className="tabular-nums text-muted-foreground">
                        {line.unitCost}
                      </span>
                    ) : hasDiscount ? (
                      <div>
                        <span className="inline-block h-7 w-24 rounded bg-muted/30 px-2 leading-7 text-right text-[12px] tabular-nums text-muted-foreground">
                          {line.unitCost}
                        </span>
                        <div className="text-[9px] text-muted-foreground">auto</div>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="text"
                          value={line.unitCost}
                          onChange={(e) =>
                            updateField(line.id, "unitCost", e.target.value)
                          }
                          onBlur={(e) => {
                            const parsed = parseDiscountExpression(e.target.value);
                            if (parsed && parsed.netCost.toFixed(2) !== e.target.value) {
                              updateField(line.id, "unitCost", parsed.netCost.toFixed(2));
                            }
                          }}
                          placeholder="e.g. 5000 -15%"
                          className="h-7 w-28 rounded border border-border bg-background px-2 text-right text-[12px] tabular-nums outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                        />
                        {line.isManualCost && (
                          <div className="text-[9px] text-muted-foreground">manual</div>
                        )}
                      </div>
                    )}
                  </td>
                  {/* Total */}
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {lineTotal.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {!isLocked && (
                      <button
                        onClick={() => onRemoveLine(line.id, line.isNew)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Remove line"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td colSpan={5} className="px-3 py-2">
                {!isPartiallyReceived && (
                  <ProductSearchInline onSelect={onAddLine} />
                )}
              </td>
              <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">
                {grandTotal.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
