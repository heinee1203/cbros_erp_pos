"use client";

import { useState, useEffect } from "react";
import { X, Receipt, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/app/auth-context";

interface ReceiptLine {
  id: string;
  productName: string;
  sku: string;
  productId: string | null;
  quantity: number;
  direction: string;
  unitPrice: string | null;
  netSales: string | null;
  costAmount: string | null;
}

interface ReceiptDetail {
  receiptNumber: string;
  date: string;
  store: string;
  cashier: string | null;
  type: string;
  source: string;
  lines: ReceiptLine[];
  totalItems: number;
  lineCount: number;
  receiptTotal: number;
  customerName: string | null;
}

interface Props {
  receiptNumber: string | null;
  onClose: () => void;
}

export function ReceiptDetailDrawer({ receiptNumber, onClose }: Props) {
  const { token, locationId } = useAuth();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptNumber || !token || !locationId) {
      setReceipt(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<ReceiptDetail>(
      `/sales/history/receipt/${encodeURIComponent(receiptNumber)}`,
      { token, locationId },
    )
      .then(setReceipt)
      .catch((err) => setError(err.message || "Failed to load receipt"))
      .finally(() => setLoading(false));
  }, [receiptNumber, token, locationId]);

  if (!receiptNumber) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-primary" />
            <h2 className="text-base font-semibold">Receipt #{receiptNumber}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="p-5 text-sm text-destructive">{error}</div>
          )}

          {receipt && !loading && (
            <>
              {/* Meta */}
              <div className="space-y-1.5 border-b border-border px-5 py-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {new Date(receipt.date).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    {new Date(receipt.date).toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Store</span>
                  <span>{receipt.store || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cashier</span>
                  <span>{receipt.cashier || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    receipt.type === "REFUND" ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700",
                  )}>
                    {receipt.type === "REFUND" ? "Refund" : "Sale"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    IMPORTED
                  </span>
                </div>
              </div>

              {/* Line Items */}
              <div className="px-5 py-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Items ({receipt.lineCount})
                </h3>
                <div className="space-y-2">
                  {receipt.lines.map((line, i) => (
                    <div
                      key={line.id}
                      className="flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2"
                    >
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium leading-tight truncate">
                            {line.productName}
                          </div>
                          {line.netSales && parseFloat(line.netSales) > 0 && (
                            <span className="shrink-0 text-sm font-semibold tabular-nums">
                              ₱{parseFloat(line.netSales).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="font-mono">{line.sku || "—"}</span>
                          <span>·</span>
                          <span>Qty: {line.quantity}{line.unitPrice && parseFloat(line.unitPrice) > 0 ? ` × ₱${parseFloat(line.unitPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "text-sm font-semibold tabular-nums",
                          line.direction === "OUT" ? "text-red-600" : "text-green-600",
                        )}>
                          {line.direction === "OUT" ? "-" : "+"}{line.quantity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-border px-5 py-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Items</span>
                  <span className="font-semibold tabular-nums">
                    {receipt.totalItems}
                  </span>
                </div>
                {receipt.receiptTotal > 0 && (
                  <div className="flex justify-between text-sm pt-1 border-t border-border/50">
                    <span className={cn("font-medium", receipt.type === "REFUND" ? "text-red-600" : "text-foreground")}>
                      {receipt.type === "REFUND" ? "Total Refund" : "Total Amount"}
                    </span>
                    <span className={cn("font-bold tabular-nums text-base", receipt.type === "REFUND" ? "text-red-600" : "text-foreground")}>
                      {receipt.type === "REFUND" ? "-" : ""}₱{receipt.receiptTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
