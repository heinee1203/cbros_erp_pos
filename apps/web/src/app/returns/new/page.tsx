"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtPeso } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useCreateReturn } from "@/hooks/use-returns";

interface SaleDetail {
  id: string;
  saleNo: string;
  status: string;
  customerId: string | null;
  grandTotal: string;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null } | null;
  lines: SaleLine[];
  payments: { method: string }[];
}

interface SaleLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  refundedQuantity: number;
  unitPrice: string;
  overridePrice: string | null;
  lineTotal: string;
}

interface ReturnLineState {
  saleLineId: string;
  productId: string;
  productName: string;
  sku: string;
  maxQty: number;
  quantity: number;
  unitPrice: number;
  selected: boolean;
  condition: "RESELLABLE" | "DAMAGED" | "DEFECTIVE";
  restock: boolean;
  notes: string;
}

const RETURN_REASONS = [
  { value: "WRONG_FITMENT", label: "Wrong Fitment" },
  { value: "DEFECTIVE", label: "Defective" },
  { value: "CUSTOMER_CHANGED_MIND", label: "Customer Changed Mind" },
  { value: "WARRANTY", label: "Warranty" },
  { value: "DUPLICATE_PURCHASE", label: "Duplicate Purchase" },
  { value: "OTHER", label: "Other" },
];

const REFUND_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "ORIGINAL_METHOD", label: "Original Payment Method" },
  { value: "STORE_CREDIT", label: "Store Credit" },
  { value: "ACCOUNT_CREDIT", label: "Account Credit" },
];

const CONDITION_OPTIONS = [
  { value: "RESELLABLE", label: "Resellable" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "DEFECTIVE", label: "Defective" },
];

export default function NewReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, locationId } = useAuth();
  const createReturn = useCreateReturn(token, locationId);

  // Step 1: Find sale
  const [saleSearch, setSaleSearch] = useState("");
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [sale, setSale] = useState<SaleDetail | null>(null);

  // Step 2: Select items
  const [lines, setLines] = useState<ReturnLineState[]>([]);

  // Step 3: Return details
  const [returnReason, setReturnReason] = useState("CUSTOMER_CHANGED_MIND");
  const [reasonNotes, setReasonNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [generalNotes, setGeneralNotes] = useState("");

  // Submitting
  const [submitError, setSubmitError] = useState("");

  // Auto-load from URL param
  useEffect(() => {
    const saleId = searchParams.get("saleId");
    if (saleId && token) {
      loadSaleById(saleId);
    }
  }, [searchParams, token]);

  const loadSaleById = useCallback(
    async (saleId: string) => {
      setSaleLoading(true);
      setSaleError("");
      try {
        const data = await apiFetch<SaleDetail>(`/sales/${saleId}`, {
          token: token!,
          locationId,
        });
        if (!data) {
          setSaleError("Sale not found");
          return;
        }
        if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(data.status)) {
          setSaleError(`Cannot return items from a sale with status "${data.status}"`);
          return;
        }
        setSale(data);
        initLines(data);
        // Auto-detect refund method from sale payments
        if (data.payments?.length > 0) {
          const method = data.payments[0].method;
          if (method === "CASH") setRefundMethod("CASH");
          else setRefundMethod("ORIGINAL_METHOD");
        }
      } catch (err: any) {
        setSaleError(err.message || "Failed to load sale");
      } finally {
        setSaleLoading(false);
      }
    },
    [token, locationId]
  );

  const handleSaleSearch = useCallback(async () => {
    if (!saleSearch.trim() || !token) return;
    setSaleLoading(true);
    setSaleError("");
    setSale(null);
    setLines([]);
    try {
      // Try to find by sale number — use the list endpoint with search
      const resp = await apiFetch<{ data: any[] }>(
        `/sales?q=${encodeURIComponent(saleSearch.trim())}&limit=1`,
        { token, locationId }
      );
      if (!resp.data || resp.data.length === 0) {
        setSaleError("No sale found matching that number");
        return;
      }
      // Load full detail
      await loadSaleById(resp.data[0].id);
    } catch (err: any) {
      setSaleError(err.message || "Failed to search for sale");
    } finally {
      setSaleLoading(false);
    }
  }, [saleSearch, token, locationId, loadSaleById]);

  const initLines = (saleData: SaleDetail) => {
    const lineStates: ReturnLineState[] = saleData.lines
      .filter((l) => l.quantity - l.refundedQuantity > 0)
      .map((l) => {
        const maxQty = l.quantity - l.refundedQuantity;
        const effectivePrice = l.overridePrice
          ? parseFloat(l.overridePrice)
          : parseFloat(l.unitPrice);
        return {
          saleLineId: l.id,
          productId: l.productId,
          productName: l.productName,
          sku: l.sku,
          maxQty,
          quantity: maxQty,
          unitPrice: effectivePrice,
          selected: false,
          condition: "RESELLABLE" as const,
          restock: true,
          notes: "",
        };
      });
    setLines(lineStates);
  };

  const toggleLine = (saleLineId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.saleLineId === saleLineId ? { ...l, selected: !l.selected } : l
      )
    );
  };

  const updateLine = (saleLineId: string, field: string, value: any) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.saleLineId !== saleLineId) return l;
        const updated = { ...l, [field]: value };
        // If condition is Damaged or Defective, default restock to false
        if (field === "condition" && (value === "DAMAGED" || value === "DEFECTIVE")) {
          updated.restock = false;
        }
        if (field === "condition" && value === "RESELLABLE") {
          updated.restock = true;
        }
        return updated;
      })
    );
  };

  const selectedLines = lines.filter((l) => l.selected);

  const returnSubtotal = useMemo(() => {
    return selectedLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  }, [selectedLines]);

  const canSubmit =
    sale &&
    selectedLines.length > 0 &&
    selectedLines.every((l) => l.quantity > 0 && l.quantity <= l.maxQty) &&
    returnReason;

  const handleSubmit = async () => {
    if (!canSubmit || !sale) return;
    setSubmitError("");
    try {
      const body = {
        originalSaleId: sale.id,
        returnReason,
        reasonNotes: reasonNotes.trim() || undefined,
        refundMethod,
        notes: generalNotes.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
        lines: selectedLines.map((l) => ({
          originalSaleLineId: l.saleLineId,
          quantity: l.quantity,
          condition: l.condition,
          restock: l.restock,
          notes: l.notes.trim() || undefined,
        })),
      };
      const result = await createReturn.mutateAsync(body);
      router.push(`/returns/${result.id}`);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create return");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/returns"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} /> Back to Returns
        </Link>
        <h2 className="text-lg font-semibold">New Return</h2>
        <p className="text-sm text-muted-foreground">
          Process a customer return against an existing sale
        </p>
      </div>

      {/* Step 1: Find Sale */}
      <div className="mb-6 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          1. Find Original Sale
        </h3>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={saleSearch}
              onChange={(e) => setSaleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaleSearch();
              }}
              placeholder="Enter sale/receipt number..."
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              disabled={saleLoading}
            />
          </div>
          <button
            onClick={handleSaleSearch}
            disabled={saleLoading || !saleSearch.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saleLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </div>
        {saleError && (
          <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
            <AlertCircle size={12} /> {saleError}
          </p>
        )}

        {/* Sale summary */}
        {sale && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
              <div>
                <span className="text-xs text-muted-foreground">Receipt #</span>
                <div className="font-mono font-semibold">{sale.saleNo}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Date</span>
                <div>{fmtDate(sale.createdAt)}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Customer</span>
                <div className="font-medium">{sale.customer?.name ?? "Walk-in"}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total</span>
                <div className="font-semibold">{fmtPeso(sale.grandTotal)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Select Items */}
      {sale && lines.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2. Select Items to Return
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-right">Available</th>
                <th className="px-3 py-2 text-right">Return Qty</th>
                <th className="px-3 py-2 text-left">Condition</th>
                <th className="px-3 py-2 text-center">Restock</th>
                <th className="px-3 py-2 text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr
                  key={line.saleLineId}
                  className={cn(
                    "border-b border-border",
                    line.selected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={line.selected}
                      onChange={() => toggleLine(line.saleLineId)}
                      className="h-4 w-4 rounded border-border"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{line.productName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{line.sku}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {line.maxQty}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      max={line.maxQty}
                      value={line.quantity}
                      onChange={(e) => {
                        const qty = Math.min(
                          Math.max(parseInt(e.target.value) || 1, 1),
                          line.maxQty
                        );
                        updateLine(line.saleLineId, "quantity", qty);
                      }}
                      disabled={!line.selected}
                      className="w-[60px] rounded border border-border px-2 py-1 text-right text-sm disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={line.condition}
                      onChange={(e) =>
                        updateLine(line.saleLineId, "condition", e.target.value)
                      }
                      disabled={!line.selected}
                      className="rounded border border-border bg-background px-1.5 py-1 text-xs disabled:opacity-40"
                    >
                      {CONDITION_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {line.condition === "RESELLABLE" ? (
                      <input
                        type="checkbox"
                        checked={line.restock}
                        onChange={(e) =>
                          updateLine(line.saleLineId, "restock", e.target.checked)
                        }
                        disabled={!line.selected}
                        className="h-4 w-4 rounded border-border disabled:opacity-40"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={line.restock}
                        onChange={(e) =>
                          updateLine(line.saleLineId, "restock", e.target.checked)
                        }
                        disabled={!line.selected}
                        className="h-4 w-4 rounded border-border disabled:opacity-40"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {line.selected
                      ? fmtPeso(line.unitPrice * line.quantity)
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selectedLines.length > 0 && (
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-right text-sm">
              <span className="text-muted-foreground">Return subtotal:</span>{" "}
              <span className="font-semibold">{fmtPeso(returnSubtotal)}</span>
            </div>
          )}
        </div>
      )}

      {sale && lines.length === 0 && (
        <div className="mb-6 rounded-xl border border-border bg-background p-6 text-center shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <p className="text-sm text-muted-foreground">
            All items on this sale have already been returned.
          </p>
        </div>
      )}

      {/* Step 3: Return Details */}
      {sale && selectedLines.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            3. Return Details
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Return Reason *
              </label>
              <select
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {RETURN_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Refund Method *
              </label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {REFUND_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Reason Notes
              </label>
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                rows={2}
                placeholder="Additional details about the reason for return..."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                General Notes
              </label>
              <textarea
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                rows={2}
                placeholder="Any other notes about this return..."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      {/* Footer */}
      <div className="sticky bottom-0 flex items-center justify-between border-t border-border bg-background px-6 py-4">
        <button
          onClick={() => router.push("/returns")}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || createReturn.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {createReturn.isPending ? (
            <Loader2 size={14} className="inline animate-spin mr-1" />
          ) : null}
          Create Return
        </button>
      </div>
    </div>
  );
}
