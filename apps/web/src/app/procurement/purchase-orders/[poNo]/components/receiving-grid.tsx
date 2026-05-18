"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useReceivePOMutation, type ReceiptLineInput } from "@/hooks/use-po-mutations";
import type { PODetail } from "@/hooks/use-po-query";
import { useSuppliers } from "@/hooks/use-suppliers";
import { apiFetch } from "@/lib/api";
import { parseDiscountExpression, recalcNetCost } from "../pricing-utils";
import { DotBatchEntryPanel, SerialEntryPanel } from "./receiving-entry-panels";
import { MutationStatusBanner, SectionHeader, Spinner, Th } from "./shared";

export function ReceivingGrid({
  po,
  refetch,
}: {
  po: PODetail;
  refetch: () => void;
}) {
  const { token, locationId } = useAuth();
  const scanRef = useRef<HTMLInputElement>(null);

  // ── Per-line receiving state ──
  interface LineState {
    acceptedQty: number;
    rejectedQty: number;
    unitCost: string;
    listPrice: string;
    discountExpr: string;
    costChanged: boolean;
    error: string | null;
    highlighted: boolean;
    checked: boolean;
    costFocused?: boolean;
    serialNumbers: { serialNumber: string; dotCode?: string }[];
    dotBatches: { dotCode: string; quantity: number }[];
  }

  const [lineStates, setLineStates] = useState<Record<string, LineState>>(
    () => {
      const init: Record<string, LineState> = {};
      for (const line of po.lines) {
        init[line.id] = {
          acceptedQty: 0,
          rejectedQty: 0,
          unitCost: line.unitCost,
          listPrice: line.listPrice || line.unitCost,
          discountExpr: line.discountChain || "",
          costChanged: false,
          error: null,
          highlighted: false,
          checked: false,
          serialNumbers: [],
          dotBatches: [],
        };
      }
      return init;
    },
  );

  const [scanValue, setScanValue] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [supplierDrNo, setSupplierDrNo] = useState("");
  const [drError, setDrError] = useState<string | null>(null);

  // ── Backorder decision modal state ──
  interface BackorderDecision {
    poLineId: string;
    productId: string;
    productName: string;
    sku: string;
    orderedQty: number;
    acceptedThisReceipt: number;
    alreadyReceived: number;
    alreadyRejected: number;
    outstanding: number;
    unitCost: string;
    decision: "backorder" | "resource" | "cancel";
    waitUntil: string;
    newSupplierId: string;
    newSupplierName: string;
  }
  const [showBackorderModal, setShowBackorderModal] = useState(false);
  const [backorderDecisions, setBackorderDecisions] = useState<BackorderDecision[]>([]);
  const [backorderPosting, setBackorderPosting] = useState(false);
  const [pendingReceiptPayload, setPendingReceiptPayload] = useState<{
    supplierDrNo: string;
    lines: ReceiptLineInput[];
    notes?: string;
  } | null>(null);

  // Suppliers for re-source dropdown
  const suppliersQuery = useSuppliers(token, locationId);
  const allSuppliers = suppliersQuery.data?.data ?? [];

  // ── Mutation hook ──
  const receiveMut = useReceivePOMutation(
    token,
    locationId,
    po.poNo,
  );

  // ── Derived: lines with remaining > 0 ──
  const receivableLines = useMemo(
    () =>
      po.lines.filter(
        (l) => l.orderedQty - l.receivedAcceptedQty - l.rejectedQty > 0,
      ),
    [po.lines],
  );

  // ── Select-all / toggle logic ──
  const allChecked = receivableLines.length > 0 &&
    receivableLines.every((l) => lineStates[l.id]?.checked);
  const someChecked = receivableLines.some((l) => lineStates[l.id]?.checked);

  const toggleAll = useCallback(() => {
    setLineStates((prev) => {
      const next = { ...prev };
      const newVal = !allChecked;
      for (const line of receivableLines) {
        if (next[line.id]) {
          next[line.id] = { ...next[line.id], checked: newVal };
        }
      }
      return next;
    });
  }, [allChecked, receivableLines]);

  const toggleLine = useCallback((lineId: string) => {
    setLineStates((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], checked: !prev[lineId]?.checked },
    }));
  }, []);

  // ── Scan assist: jump focus to matching PO line ──
  const lineRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const lineInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleScan = useCallback(
    (value: string) => {
      const normalized = value.trim().toUpperCase();
      if (!normalized) return;

      // Find matching line by mnemonic SKU or SKU
      const matchedLine = receivableLines.find(
        (l) =>
          l.mnemonicSku.toUpperCase() === normalized ||
          l.sku.toUpperCase() === normalized,
      );

      if (matchedLine) {
        // Compute remaining for this line
        const remaining = matchedLine.orderedQty - matchedLine.receivedAcceptedQty - matchedLine.rejectedQty;
        // Clear all highlights, then highlight + auto-check the matched line
        setLineStates((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            next[key] = { ...next[key], highlighted: false };
          }
          if (next[matchedLine.id]) {
            next[matchedLine.id] = {
              ...next[matchedLine.id],
              highlighted: true,
              checked: true,
              acceptedQty: remaining,
              error: null,
            };
          }
          return next;
        });

        // Scroll into view + focus the accepted qty input
        lineRowRefs.current[matchedLine.id]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setTimeout(() => {
          lineInputRefs.current[matchedLine.id]?.focus();
          lineInputRefs.current[matchedLine.id]?.select();
        }, 100);
      }

      setScanValue("");
    },
    [receivableLines],
  );

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(scanValue);
    }
  };

  // ── Update line quantities with validation ──
  const updateLine = useCallback(
    (
      lineId: string,
      field: "acceptedQty" | "rejectedQty" | "unitCost",
      rawValue: string | number,
    ) => {
      setLineStates((prev) => {
        const line = po.lines.find((l) => l.id === lineId);
        if (!line) return prev;

        const current = prev[lineId];
        const remaining =
          line.orderedQty - line.receivedAcceptedQty - line.rejectedQty;

        let next = { ...current };

        if (field === "unitCost") {
          const strVal = String(rawValue);
          next.unitCost = strVal;
          next.costChanged = strVal !== line.unitCost;
        } else {
          const numVal = Math.max(0, parseInt(String(rawValue)) || 0);
          if (field === "acceptedQty") {
            next.acceptedQty = numVal;
          } else {
            next.rejectedQty = numVal;
          }
        }

        // Hard enforcement: accepted + rejected <= remaining
        const totalThisReceipt = next.acceptedQty + next.rejectedQty;
        if (totalThisReceipt > remaining) {
          next.error = `Accepted (${next.acceptedQty}) + Rejected (${next.rejectedQty}) = ${totalThisReceipt} exceeds remaining receivable (${remaining})`;
        } else {
          next.error = null;
        }

        return { ...prev, [lineId]: next };
      });
    },
    [po.lines],
  );

  // ── Submission ──
  const hasValidLines = useMemo(() => {
    return receivableLines.some((line) => {
      const state = lineStates[line.id];
      if (!state || !state.checked) return false;
      return (state.acceptedQty > 0 || state.rejectedQty > 0) && !state.error;
    });
  }, [receivableLines, lineStates]);

  const hasAnyErrors = useMemo(() => {
    return receivableLines.some((l) => {
      const s = lineStates[l.id];
      return s?.checked && s.error !== null;
    });
  }, [receivableLines, lineStates]);

  const hasAnyRejections = useMemo(() => {
    return Object.values(lineStates).some((s) => s.rejectedQty > 0);
  }, [lineStates]);

  const selectedCount = receivableLines.filter((l) => lineStates[l.id]?.checked).length;
  const selectedAccepted = receivableLines.reduce((sum, l) => {
    const s = lineStates[l.id];
    return sum + (s?.checked ? s.acceptedQty : 0);
  }, 0);

  const handlePostReceipt = useCallback(() => {
    if (!hasValidLines || hasAnyErrors || receiveMut.isSubmitting) return;
    if (!supplierDrNo.trim()) {
      setDrError("Supplier DR number is required");
      return;
    }
    setDrError(null);

    // Check serial count for serialized items (not tires)
    const serialMismatch = receivableLines.find((line) => {
      const state = lineStates[line.id];
      if (!state?.checked || !line.isSerialized || (line as any).isTire || state.acceptedQty === 0) return false;
      return state.serialNumbers.length !== state.acceptedQty;
    });
    if (serialMismatch) {
      const st = lineStates[serialMismatch.id]!;
      alert(`Enter serial numbers for ${serialMismatch.productName} (${st.acceptedQty} required, ${st.serialNumbers.length} entered)`);
      return;
    }

    // Check DOT batch totals for tire items
    const dotMismatch = receivableLines.find((line) => {
      const state = lineStates[line.id];
      if (!state?.checked || !(line as any).isTire || state.acceptedQty === 0) return false;
      const batchTotal = state.dotBatches.reduce((s, b) => s + b.quantity, 0);
      return batchTotal !== state.acceptedQty;
    });
    if (dotMismatch) {
      const st = lineStates[dotMismatch.id]!;
      const batchTotal = st.dotBatches.reduce((s, b) => s + b.quantity, 0);
      alert(`Enter DOT batches for ${dotMismatch.productName} (${st.acceptedQty} units required, ${batchTotal} allocated)`);
      return;
    }

    const lines: ReceiptLineInput[] = receivableLines
      .filter((line) => {
        const state = lineStates[line.id];
        return state?.checked && (state.acceptedQty > 0 || state.rejectedQty > 0);
      })
      .map((line) => {
        const state = lineStates[line.id]!;
        return {
          poLineId: line.id,
          receivedAcceptedQty: state.acceptedQty,
          rejectedQty: state.rejectedQty,
          unitCost: state.unitCost,
          ...(line.isSerialized && !(line as any).isTire && state.serialNumbers.length > 0
            ? { serialNumbers: state.serialNumbers }
            : {}),
          ...((line as any).isTire && state.dotBatches.length > 0
            ? { dotBatches: state.dotBatches }
            : {}),
        };
      });

    // Post receipt directly — no backorder modal here
    // Backorders are handled separately via "Close PO" button
    receiveMut.submit(po.id, {
      supplierDrNo: supplierDrNo.trim(),
      lines,
      notes: receiptNotes.trim() || undefined,
    });
  }, [hasValidLines, hasAnyErrors, receiveMut, receivableLines, lineStates, po, receiptNotes, supplierDrNo]);

  // Close PO + create backorders from the modal
  const handleConfirmBackorders = useCallback(async () => {
    if (!token || !locationId) return;
    setBackorderPosting(true);

    try {
      // 1. Create backorder entries for remaining items
      const items = backorderDecisions.map((d) => ({
        productId: d.productId,
        supplierId: po.supplierId,
        quantity: d.outstanding,
        quantityOrdered: d.orderedQty,
        quantityReceived: d.alreadyReceived + d.acceptedThisReceipt,
        quantityOutstanding: d.outstanding,
        productName: d.productName,
        sku: d.sku,
        supplierName: po.supplier?.name ?? "",
        unitCost: d.unitCost,
        originalPoId: po.id,
        originalPoNumber: po.poNo,
        originalPoLineId: d.poLineId,
        reason: "Partial receipt — remaining on backorder",
        decision: d.decision,
        waitUntil: d.decision === "backorder" ? d.waitUntil : undefined,
        newSupplierId: d.decision === "resource" ? d.newSupplierId : undefined,
      }));

      await apiFetch("/procurement/backorders/bulk", {
        method: "POST",
        token,
        locationId,
        body: { items } as any,
      });

      // 2. Close the PO with variance
      await apiFetch(`/procurement/purchase-orders/${po.id}/close-variance`, {
        method: "POST",
        token,
        locationId,
        body: {
          notes: "Closed — remaining items sent to backorders",
          idempotencyKey: `close-bo-${po.id}-${Date.now()}`,
        } as any,
      });

      setShowBackorderModal(false);
      setPendingReceiptPayload(null);
      setBackorderDecisions([]);

      // Refetch PO to show updated status
      if (typeof window !== "undefined") window.location.reload();
    } catch (e: any) {
      console.error("Close PO failed:", e);
    } finally {
      setBackorderPosting(false);
    }
  }, [backorderDecisions, po, token, locationId]);

  // "Close PO" handler — calculates remaining and shows backorder modal
  const handleClosePO = useCallback(() => {
    const defaultWait = new Date();
    defaultWait.setDate(defaultWait.getDate() + 14);
    const waitStr = defaultWait.toISOString().split("T")[0];

    const remaining: BackorderDecision[] = [];
    for (const line of po.lines) {
      const totalReceived = line.receivedAcceptedQty;
      const totalRejected = line.rejectedQty;
      const outstanding = line.orderedQty - totalReceived - totalRejected;
      if (outstanding > 0) {
        remaining.push({
          poLineId: line.id,
          productId: line.productId,
          productName: (line as any).parentName
            ? `${(line as any).parentName} (${line.productName})`
            : line.productName,
          sku: line.sku,
          orderedQty: line.orderedQty,
          acceptedThisReceipt: 0,
          alreadyReceived: totalReceived,
          alreadyRejected: totalRejected,
          outstanding,
          unitCost: line.unitCost,
          decision: "backorder",
          waitUntil: waitStr,
          newSupplierId: "",
          newSupplierName: "",
        });
      }
    }

    if (remaining.length === 0) {
      // All items fully received — just close
      if (confirm("All items have been received. Close this PO?")) {
        apiFetch(`/procurement/purchase-orders/${po.id}/close-variance`, {
          method: "POST",
          token: token!,
          locationId: locationId!,
          body: {
            notes: "Closed — all items received",
            idempotencyKey: `close-${po.id}-${Date.now()}`,
          } as any,
        }).then(() => window.location.reload());
      }
    } else {
      setBackorderDecisions(remaining);
      setShowBackorderModal(true);
    }
  }, [po, token, locationId]);

  // Auto-refetch on success
  useEffect(() => {
    if (
      receiveMut.status === "success" ||
      receiveMut.status === "already_processed"
    ) {
      setSupplierDrNo("");
      setDrError(null);
      const timer = setTimeout(() => {
        receiveMut.reset();
        refetch();
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [receiveMut.status, receiveMut, refetch]);

  // Focus scan field on mount
  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  return (
    <section>
      <SectionHeader>Receiving Grid</SectionHeader>

      {/* ── Supplier DR Number ── */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold text-foreground">
          Supplier DR Number <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={supplierDrNo}
          onChange={(e) => { setSupplierDrNo(e.target.value); if (drError) setDrError(null); }}
          placeholder="e.g. DR-2024-0892"
          disabled={receiveMut.isSubmitting}
          className={`w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm font-medium outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50 ${drError ? "border-destructive" : "border-border"}`}
        />
        {drError && <p className="mt-1 text-xs text-destructive">{drError}</p>}
      </div>

      {/* ── Scan Assist Field ── */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={scanRef}
            type="text"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={handleScanKeyDown}
            placeholder="Scan barcode or type SKU … press Enter"
            disabled={receiveMut.isSubmitting}
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline-block">
          Enter
        </kbd>
      </div>

      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{selectedCount} of {receivableLines.length} remaining lines selected</span>
      </div>

      {/* ── Dense Grid ── */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th scope="col" className="w-10 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={toggleAll}
                  disabled={receiveMut.isSubmitting}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
              </th>
              <Th align="left" width="w-[180px]">Item</Th>
              <Th align="right" width="w-[70px]">Ordered</Th>
              <Th align="right" width="w-[80px]">Accepted</Th>
              <Th align="right" width="w-[80px]">Rejected</Th>
              <Th align="right" width="w-[80px]">Remaining</Th>
              <Th align="right" width="w-[90px]">Accept Now</Th>
              <Th align="right" width="w-[90px]">Reject Now</Th>
              <Th align="right" width="w-[80px]">List Price</Th>
              <Th align="right" width="w-[70px]">Discount</Th>
              <Th align="right" width="w-[80px]">Net Cost</Th>
              <Th align="left" width="w-[40px]" />
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line, i) => {
              const remaining =
                line.orderedQty -
                line.receivedAcceptedQty -
                line.rejectedQty;
              const state = lineStates[line.id];
              const isReceivable = remaining > 0;
              const isHighlighted = state?.highlighted;

              return (
                <React.Fragment key={line.id}>
                <tr
                  ref={(el) => {
                    lineRowRefs.current[line.id] = el;
                  }}
                  className={`border-b border-border transition-colors ${
                    isHighlighted
                      ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                      : i % 2 === 0
                        ? "bg-background"
                        : "bg-muted/20"
                  } ${!isReceivable ? "opacity-50" : ""} ${isReceivable && !state?.checked ? "opacity-50" : ""}`}
                >
                  {/* Checkbox */}
                  <td className="px-2 py-1.5">
                    {isReceivable && (
                      <input
                        type="checkbox"
                        checked={state?.checked ?? false}
                        onChange={() => toggleLine(line.id)}
                        disabled={receiveMut.isSubmitting}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                    )}
                  </td>

                  {/* Product Name */}
                  <td className="px-2 py-1.5">
                    <div
                      className="max-w-[220px] truncate text-xs font-medium"
                      title={(line as any).parentName ? `${(line as any).parentName} (${line.productName})` : line.productName}
                    >
                      {(line as any).parentName ? `${(line as any).parentName} (${line.productName})` : line.productName}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {line.sku}
                    </div>
                  </td>

                  {/* Ordered */}
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {line.orderedQty}
                  </td>

                  {/* Accepted So Far */}
                  <td className="px-2 py-1.5 text-right tabular-nums text-success font-medium">
                    {line.receivedAcceptedQty}
                  </td>

                  {/* Rejected So Far */}
                  <td className="px-2 py-1.5 text-right tabular-nums text-destructive font-medium">
                    {line.rejectedQty > 0 ? line.rejectedQty : "\u2014"}
                  </td>

                  {/* Remaining Receivable */}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {remaining > 0 ? (
                      <span className="text-warning">{remaining}</span>
                    ) : (
                      <span className="text-success">0</span>
                    )}
                  </td>

                  {/* Accept Now — editable input */}
                  <td className="px-2 py-1.5 text-right">
                    {isReceivable ? (
                      <input
                        ref={(el) => {
                          lineInputRefs.current[line.id] = el;
                        }}
                        type="number"
                        min="0"
                        max={remaining}
                        value={state?.acceptedQty ?? 0}
                        onChange={(e) =>
                          updateLine(line.id, "acceptedQty", e.target.value)
                        }
                        disabled={receiveMut.isSubmitting}
                        className={`w-[70px] rounded border bg-background px-1.5 py-1 text-right text-sm tabular-nums font-medium outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50 ${
                          state?.error
                            ? "border-destructive text-destructive"
                            : "border-border"
                        }`}
                      />
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </td>

                  {/* Reject Now — editable input */}
                  <td className="px-2 py-1.5 text-right">
                    {isReceivable ? (
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        value={state?.rejectedQty ?? 0}
                        onChange={(e) =>
                          updateLine(line.id, "rejectedQty", e.target.value)
                        }
                        disabled={receiveMut.isSubmitting}
                        className={`w-[70px] rounded border bg-background px-1.5 py-1 text-right text-sm tabular-nums font-medium outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50 ${
                          state?.error
                            ? "border-destructive text-destructive"
                            : state?.rejectedQty > 0
                              ? "border-warning text-warning"
                              : "border-border"
                        }`}
                      />
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </td>

                  {/* List Price — editable, accepts discount expressions */}
                  <td className="px-1 py-1.5 text-right">
                    {isReceivable ? (
                      <input
                        type="text"
                        value={state?.listPrice ?? line.listPrice ?? line.unitCost}
                        onChange={(e) => {
                          setLineStates((prev) => {
                            const s = prev[line.id];
                            return { ...prev, [line.id]: { ...s, listPrice: e.target.value, costChanged: true } };
                          });
                        }}
                        onBlur={(e) => {
                          const parsed = parseDiscountExpression(e.target.value);
                          if (parsed) {
                            setLineStates((prev) => {
                              const s = prev[line.id];
                              return { ...prev, [line.id]: {
                                ...s,
                                listPrice: parsed.listPrice.toFixed(2),
                                discountExpr: parsed.discountExpr || s.discountExpr || "",
                                unitCost: parsed.netCost.toFixed(2),
                                costChanged: parsed.netCost.toFixed(2) !== line.unitCost,
                              }};
                            });
                          }
                        }}
                        disabled={receiveMut.isSubmitting}
                        className={`w-[80px] rounded border bg-background px-1 py-1 text-right text-[11px] tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50 ${state?.costChanged ? "border-warning" : "border-border"}`}
                        placeholder="List price"
                      />
                    ) : (
                      <span className="text-[11px] tabular-nums text-muted-foreground">{line.listPrice || line.unitCost}</span>
                    )}
                  </td>

                  {/* Discount */}
                  <td className="px-1 py-1.5 text-right">
                    {isReceivable ? (
                      <input
                        type="text"
                        value={state?.discountExpr ?? line.discountChain ?? ""}
                        onChange={(e) => {
                          setLineStates((prev) => {
                            const s = prev[line.id];
                            const lp = parseFloat(s.listPrice) || 0;
                            const net = recalcNetCost(lp, e.target.value);
                            return { ...prev, [line.id]: {
                              ...s,
                              discountExpr: e.target.value,
                              unitCost: net.toFixed(2),
                              costChanged: true,
                            }};
                          });
                        }}
                        disabled={receiveMut.isSubmitting}
                        className="w-[70px] rounded border border-border bg-background px-1 py-1 text-right text-[11px] tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                        placeholder="-15%"
                      />
                    ) : (
                      <span className="text-[11px] tabular-nums text-muted-foreground">{line.discountChain || "\u2014"}</span>
                    )}
                  </td>

                  {/* Net Cost — calculated */}
                  <td className="px-1 py-1.5 text-right">
                    <span className={`text-[11px] tabular-nums font-medium ${state?.costChanged ? "text-warning" : ""}`}>
                      {parseFloat(state?.unitCost ?? line.unitCost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </span>
                  </td>

                  {/* Status indicator */}
                  <td className="px-2 py-1.5">
                    {state?.costChanged && isReceivable && (
                      <span title="Cost changed from PO line value">
                        <svg
                          className="h-4 w-4 text-warning"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                          />
                        </svg>
                      </span>
                    )}
                  </td>
                </tr>
                {/* Serial entry panel for serialized items */}
                {line.isSerialized && isReceivable && state?.checked && state.acceptedQty > 0 && (
                  <tr className="bg-muted/10">
                    <td colSpan={12} className="px-4 py-2 border-b border-border">
                      <SerialEntryPanel
                        lineId={line.id}
                        productId={line.productId}
                        requiredCount={state.acceptedQty}
                        serials={state.serialNumbers}
                        disabled={receiveMut.isSubmitting}
                        token={token}
                        locationId={locationId}
                        onUpdate={(serials) => {
                          setLineStates((prev) => ({
                            ...prev,
                            [line.id]: { ...prev[line.id], serialNumbers: serials },
                          }));
                        }}
                      />
                    </td>
                  </tr>
                )}
                {/* DOT batch entry panel for tire products */}
                {(line as any).isTire && !line.isSerialized && isReceivable && state?.checked && state.acceptedQty > 0 && (
                  <tr className="bg-muted/10">
                    <td colSpan={12} className="px-4 py-2 border-b border-border">
                      <DotBatchEntryPanel
                        requiredCount={state.acceptedQty}
                        batches={state.dotBatches}
                        disabled={receiveMut.isSubmitting}
                        onUpdate={(batches) => {
                          setLineStates((prev) => ({
                            ...prev,
                            [line.id]: { ...prev[line.id], dotBatches: batches },
                          }));
                        }}
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Inline validation errors ── */}
      {Object.entries(lineStates).map(([lineId, state]) => {
        if (!state.error) return null;
        const line = po.lines.find((l) => l.id === lineId);
        return (
          <div
            key={lineId}
            className="mt-1 flex items-center gap-1.5 rounded border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {state.error}
          </div>
        );
      })}

      {/* ── Rejection Warning ── */}
      {hasAnyRejections && (
        <div className="mt-2 flex items-start gap-2 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <span>
            <strong>Rejection warning:</strong> Rejected quantity permanently
            reduces the remaining receivable amount. Use only for final
            variance, not for items awaiting supplier replacement.
          </span>
        </div>
      )}

      {/* ── Cost Change Warning ── */}
      {Object.values(lineStates).some((s) => s.costChanged) && (
        <div className="mt-2 flex items-start gap-2 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            <strong>Cost change detected:</strong> Modified unit costs will
            update the product&apos;s current cost price and regenerate its
            mnemonic cost code (KINGSCOBRA) upon submission.
          </span>
        </div>
      )}

      {/* ── Receipt Notes ── */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Receipt Notes{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          value={receiptNotes}
          onChange={(e) => setReceiptNotes(e.target.value)}
          placeholder="Delivery notes, GRN reference, condition remarks..."
          rows={2}
          disabled={receiveMut.isSubmitting}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
        />
      </div>

      {/* ── Mutation Status ── */}
      {receiveMut.statusMessage && (
        <MutationStatusBanner
          status={receiveMut.status}
          message={receiveMut.statusMessage}
        />
      )}

      {/* ── Post Receipt + Close PO Buttons ── */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handlePostReceipt}
          disabled={!hasValidLines || hasAnyErrors || !supplierDrNo.trim() || receiveMut.isSubmitting}
          className="rounded-md bg-success px-6 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {receiveMut.isSubmitting ? (
            <span className="flex items-center gap-2"><Spinner /> Posting Receipt...</span>
          ) : supplierDrNo.trim() ? (
            `Post Receipt for ${supplierDrNo.trim()}`
          ) : (
            "Post Receipt"
          )}
        </button>
        {/* Close PO — only when at least one receipt has been posted */}
        {(po.status === "PARTIALLY_RECEIVED" || po.status === "SUBMITTED") && (
          <button
            type="button"
            onClick={handleClosePO}
            className="rounded-md border border-warning px-5 py-1.5 text-sm font-medium text-warning hover:bg-warning/10 transition-colors"
          >
            Close PO
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          {hasAnyErrors
            ? "Fix validation errors before posting"
            : !supplierDrNo.trim()
              ? "Enter supplier DR number"
              : !hasValidLines
                ? "Select lines and enter quantities"
                : `${selectedCount} lines, ${selectedAccepted} units accepted`}
        </span>
      </div>

      {/* ── Backorder Decision Modal ── */}
      {showBackorderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowBackorderModal(false)}>
          <div className="w-full max-w-xl rounded-xl border border-border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Handle Remaining Items</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {backorderDecisions.length} item(s) not fully delivered. Choose what to do with each:
                </p>
              </div>
              <button onClick={() => setShowBackorderModal(false)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X size={14} />
              </button>
            </div>

            <div className="max-h-[55vh] space-y-3 overflow-y-auto">
              {backorderDecisions.map((d, i) => (
                <div key={d.poLineId} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{d.productName}</span>
                      {d.sku && <span className="ml-2 text-[10px] font-mono text-muted-foreground">{d.sku}</span>}
                    </div>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      {d.outstanding} remaining
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Ordered: {d.orderedQty} · Received: {d.alreadyReceived + d.acceptedThisReceipt} · Cost: ₱{parseFloat(d.unitCost).toLocaleString()}
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    {/* Wait on supplier */}
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`bo-decision-${i}`}
                        checked={d.decision === "backorder"}
                        onChange={() => setBackorderDecisions((prev) => prev.map((x, j) => j === i ? { ...x, decision: "backorder" } : x))}
                        className="mt-0.5 h-3.5 w-3.5"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-medium">Wait on supplier</span>
                        {d.decision === "backorder" && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">Wait until:</span>
                            <input
                              type="date"
                              value={d.waitUntil}
                              onChange={(e) => setBackorderDecisions((prev) => prev.map((x, j) => j === i ? { ...x, waitUntil: e.target.value } : x))}
                              className="rounded border border-input px-2 py-0.5 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </label>

                    {/* Source from different supplier */}
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`bo-decision-${i}`}
                        checked={d.decision === "resource"}
                        onChange={() => setBackorderDecisions((prev) => prev.map((x, j) => j === i ? { ...x, decision: "resource" } : x))}
                        className="mt-0.5 h-3.5 w-3.5"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-medium">Source from different supplier</span>
                        {d.decision === "resource" && (
                          <select
                            value={d.newSupplierId}
                            onChange={(e) => {
                              const s = allSuppliers.find((s: any) => s.id === e.target.value);
                              setBackorderDecisions((prev) => prev.map((x, j) => j === i ? { ...x, newSupplierId: e.target.value, newSupplierName: s?.name ?? "" } : x));
                            }}
                            className="mt-1 w-full rounded border border-input px-2 py-1 text-xs"
                          >
                            <option value="">Select supplier...</option>
                            {allSuppliers
                              .filter((s: any) => s.id !== po.supplierId)
                              .map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                          </select>
                        )}
                      </div>
                    </label>

                    {/* Cancel remainder */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`bo-decision-${i}`}
                        checked={d.decision === "cancel"}
                        onChange={() => setBackorderDecisions((prev) => prev.map((x, j) => j === i ? { ...x, decision: "cancel" } : x))}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs font-medium text-red-600">Cancel remainder</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {backorderDecisions.filter((d) => d.decision === "backorder").length} waiting ·{" "}
              {backorderDecisions.filter((d) => d.decision === "resource").length} re-sourcing ·{" "}
              {backorderDecisions.filter((d) => d.decision === "cancel").length} cancelling
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowBackorderModal(false); setPendingReceiptPayload(null); }}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Back
              </button>
              <button
                onClick={handleConfirmBackorders}
                disabled={backorderPosting || backorderDecisions.some((d) => d.decision === "resource" && !d.newSupplierId)}
                className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-success/90 disabled:opacity-50"
              >
                {backorderPosting && <Loader2 size={12} className="animate-spin" />}
                Close PO & Create Backorders
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
