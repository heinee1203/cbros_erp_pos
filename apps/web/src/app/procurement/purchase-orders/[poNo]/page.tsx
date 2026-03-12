"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Printer } from "lucide-react";
import {
  usePOQuery,
  type PODetail,
  type POLine,
} from "@/hooks/use-po-query";
import {
  useSubmitPOMutation,
  useReceivePOMutation,
  useCloseVariancePOMutation,
  useCancelPOMutation,
  type POMutationStatus,
  type ReceiptLineInput,
} from "@/hooks/use-po-mutations";
import { useAuth } from "@/app/auth-context";

// ── Status badge styling ──
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-primary/10 text-primary",
  PARTIALLY_RECEIVED: "bg-warning/10 text-warning",
  FULLY_RECEIVED: "bg-success/10 text-success",
  CLOSED_WITH_VARIANCE: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PARTIALLY_RECEIVED: "Partially Received",
  FULLY_RECEIVED: "Fully Received",
  CLOSED_WITH_VARIANCE: "Closed (Variance)",
  CANCELLED: "Cancelled",
};

/** Terminal states freeze the grid to read-only */
const TERMINAL_STATES = new Set([
  "FULLY_RECEIVED",
  "CLOSED_WITH_VARIANCE",
  "CANCELLED",
]);

/** States that allow receiving */
const RECEIVABLE_STATES = new Set(["SUBMITTED", "PARTIALLY_RECEIVED"]);

/* ══════════════════════════════════════════════════════════
 * Purchase Order Detail Page — /procurement/purchase-orders/[poNo]
 *
 * Dense, desktop-first, keyboard-heavy warehouse receiving screen.
 * Zero optimistic UI. All state from backend refetch.
 * ══════════════════════════════════════════════════════════ */
export default function PODetailPage() {
  const params = useParams<{ poNo: string }>();
  const poNo = params.poNo;
  const { token, locationId, loading: authLoading } = useAuth();

  const {
    data: po,
    isLoading,
    error,
    refetch,
  } = usePOQuery(poNo, token, locationId);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">
          Loading PO {poNo}...
        </div>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-sm font-medium text-destructive">
          Purchase Order not found
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          PO {poNo} does not exist or you do not have access.
        </p>
        <a
          href="/"
          className="mt-4 text-xs text-primary hover:underline"
        >
          Back to Inventory
        </a>
      </div>
    );
  }

  return <PODetailView po={po} refetch={refetch} />;
}

/* ─────────────────────────────────────────────
 * Main Detail View (separated for clean hooks usage)
 * ───────────────────────────────────────────── */
function PODetailView({
  po,
  refetch,
}: {
  po: PODetail;
  refetch: () => void;
}) {
  const isTerminal = TERMINAL_STATES.has(po.status);
  const canReceive = RECEIVABLE_STATES.has(po.status);
  const isDraft = po.status === "DRAFT";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <a
            href="/procurement/purchase-orders"
            className="text-xs text-muted-foreground hover:text-primary"
          >
            &larr; Back to Purchase Orders
          </a>
          <h2 className="mt-1 text-lg font-bold tracking-tight">
            {po.poNo}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                STATUS_STYLES[po.status] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {STATUS_LABELS[po.status] ?? po.status}
            </span>
            <span className="text-xs text-muted-foreground">
              Supplier: <strong>{po.supplier.name}</strong>
            </span>
          </div>
        </div>
        {/* Action buttons — contextual */}
        <div className="flex items-center gap-2">
          {po.status !== "CANCELLED" && (
            <Link
              href={`/inventory/barcode-printing?poNo=${encodeURIComponent(po.poNo)}`}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Printer size={14} />
              Print Barcodes
            </Link>
          )}
          {isDraft && (
            <SubmitPOButton po={po} />
          )}
          {(isDraft || po.status === "SUBMITTED") && (
            <CancelPOButton po={po} />
          )}
          {po.status === "PARTIALLY_RECEIVED" && (
            <CloseVarianceButton po={po} />
          )}
        </div>
      </div>

      {/* ── Route: Supplier → Destination ── */}
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <InfoChip
          label="Supplier"
          primary={po.supplier.name}
          secondary={po.supplier.contactPhone ?? po.supplier.contactEmail ?? undefined}
        />
        <svg
          className="h-5 w-5 shrink-0 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 8l4 4m0 0l-4 4m4-4H3"
          />
        </svg>
        <InfoChip
          label="Destination"
          primary={po.destination.name}
          secondary={po.destination.code}
        />
        {po.expectedDeliveryDate && (
          <InfoChip
            label="Expected Delivery"
            primary={new Date(po.expectedDeliveryDate).toLocaleDateString(
              "en-US",
              { month: "short", day: "numeric", year: "numeric" },
            )}
          />
        )}
      </div>

      {/* ── Timeline ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TimelineCard label="Created" date={po.createdAt} />
        <TimelineCard label="Submitted" date={po.submittedAt} />
        <TimelineCard label="Closed" date={po.closedAt} />
        <TimelineCard label="Cancelled" date={po.cancelledAt} />
      </div>

      {/* ── Receiving Grid (the core of this page) ── */}
      {canReceive ? (
        <ReceivingGrid po={po} refetch={refetch} />
      ) : (
        <ReadOnlyGrid po={po} isTerminal={isTerminal} />
      )}

      {/* ── Receipt Event History ── */}
      {po.receiptEvents.length > 0 && (
        <ReceiptHistory po={po} />
      )}

      {/* ── Notes ── */}
      {po.notes && (
        <section>
          <SectionHeader>Notes</SectionHeader>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {po.notes}
          </p>
        </section>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * RECEIVING GRID — The dense, desktop-first warehouse control screen
 *
 *  - Barcode/SKU scan assist field
 *  - Dense table with: Product, Mnemonic, Ordered, Accepted So Far,
 *    Rejected So Far, Remaining, receiveNowAccepted, rejectNow, UnitCost
 *  - Hard enforcement: accepted + rejected <= remaining
 *  - Rejection warning
 *  - Cost change visual flag
 *  - Single guarded "Post Receipt" button
 *  - Zero optimistic UI
 * ══════════════════════════════════════════════════════════ */
function ReceivingGrid({
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
    costChanged: boolean;
    error: string | null;
    highlighted: boolean;
  }

  const [lineStates, setLineStates] = useState<Record<string, LineState>>(
    () => {
      const init: Record<string, LineState> = {};
      for (const line of po.lines) {
        init[line.id] = {
          acceptedQty: 0,
          rejectedQty: 0,
          unitCost: line.unitCost,
          costChanged: false,
          error: null,
          highlighted: false,
        };
      }
      return init;
    },
  );

  const [scanValue, setScanValue] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");

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
        // Clear all highlights, then highlight the matched line
        setLineStates((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            next[key] = { ...next[key], highlighted: false };
          }
          if (next[matchedLine.id]) {
            next[matchedLine.id] = {
              ...next[matchedLine.id],
              highlighted: true,
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
      if (!state) return false;
      return (
        (state.acceptedQty > 0 || state.rejectedQty > 0) && !state.error
      );
    });
  }, [receivableLines, lineStates]);

  const hasAnyErrors = useMemo(() => {
    return Object.values(lineStates).some((s) => s.error !== null);
  }, [lineStates]);

  const hasAnyRejections = useMemo(() => {
    return Object.values(lineStates).some((s) => s.rejectedQty > 0);
  }, [lineStates]);

  const handlePostReceipt = useCallback(() => {
    if (!hasValidLines || hasAnyErrors || receiveMut.isSubmitting) return;

    // Build receipt lines — strip out rows where both accepted and rejected are 0
    const lines: ReceiptLineInput[] = receivableLines
      .filter((line) => {
        const state = lineStates[line.id];
        return state && (state.acceptedQty > 0 || state.rejectedQty > 0);
      })
      .map((line) => {
        const state = lineStates[line.id]!;
        return {
          poLineId: line.id,
          receivedAcceptedQty: state.acceptedQty,
          rejectedQty: state.rejectedQty,
          unitCost: state.unitCost,
        };
      });

    receiveMut.submit(po.id, {
      lines,
      notes: receiptNotes.trim() || undefined,
    });
  }, [
    hasValidLines,
    hasAnyErrors,
    receiveMut,
    receivableLines,
    lineStates,
    po.id,
    receiptNotes,
  ]);

  // Auto-refetch on success
  useEffect(() => {
    if (
      receiveMut.status === "success" ||
      receiveMut.status === "already_processed"
    ) {
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
            placeholder="Scan barcode or type SKU / Mnemonic \u2026 press Enter"
            disabled={receiveMut.isSubmitting}
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline-block">
          Enter
        </kbd>
      </div>

      {/* ── Dense Grid ── */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <Th align="left" width="w-[180px]">Product</Th>
              <Th align="left" width="w-[100px]">Mnemonic</Th>
              <Th align="right" width="w-[70px]">Ordered</Th>
              <Th align="right" width="w-[80px]">Accepted</Th>
              <Th align="right" width="w-[80px]">Rejected</Th>
              <Th align="right" width="w-[80px]">Remaining</Th>
              <Th align="right" width="w-[90px]">Accept Now</Th>
              <Th align="right" width="w-[90px]">Reject Now</Th>
              <Th align="right" width="w-[110px]">Unit Cost</Th>
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
                <tr
                  key={line.id}
                  ref={(el) => {
                    lineRowRefs.current[line.id] = el;
                  }}
                  className={`border-b border-border transition-colors ${
                    isHighlighted
                      ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                      : i % 2 === 0
                        ? "bg-background"
                        : "bg-muted/20"
                  } ${!isReceivable ? "opacity-50" : ""}`}
                >
                  {/* Product Name */}
                  <td className="px-2 py-1.5">
                    <div
                      className="max-w-[180px] truncate text-xs font-medium"
                      title={line.productName}
                    >
                      {line.productName}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {line.sku}
                    </div>
                  </td>

                  {/* Mnemonic SKU */}
                  <td className="px-2 py-1.5">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary">
                      {line.mnemonicSku}
                    </span>
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
                      <span className="text-muted-foreground">\u2014</span>
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
                      <span className="text-muted-foreground">\u2014</span>
                    )}
                  </td>

                  {/* Unit Cost — editable, prefilled from PO line */}
                  <td className="px-2 py-1.5 text-right">
                    {isReceivable ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="text"
                          value={state?.unitCost ?? line.unitCost}
                          onChange={(e) =>
                            updateLine(line.id, "unitCost", e.target.value)
                          }
                          disabled={receiveMut.isSubmitting}
                          className={`w-[90px] rounded border bg-background px-1.5 py-1 text-right text-sm tabular-nums outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50 ${
                            state?.costChanged
                              ? "border-warning bg-warning/5 text-warning"
                              : "border-border"
                          }`}
                        />
                      </div>
                    ) : (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {line.unitCost}
                      </span>
                    )}
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
            <span className="font-mono font-medium">
              {line?.mnemonicSku}:
            </span>{" "}
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

      {/* ── Post Receipt Button ── */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handlePostReceipt}
          disabled={!hasValidLines || hasAnyErrors || receiveMut.isSubmitting}
          className="rounded-md bg-success px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {receiveMut.isSubmitting ? (
            <span className="flex items-center gap-2">
              <Spinner /> Posting Receipt...
            </span>
          ) : (
            "Post Receipt"
          )}
        </button>
        <span className="text-xs text-muted-foreground">
          {hasAnyErrors
            ? "Fix validation errors before posting"
            : !hasValidLines
              ? "Enter quantities to receive or reject"
              : "Ready to post"}
        </span>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
 * READ-ONLY GRID — For DRAFT, terminal states (FULLY_RECEIVED, etc.)
 * ══════════════════════════════════════════════════════════ */
function ReadOnlyGrid({
  po,
  isTerminal,
}: {
  po: PODetail;
  isTerminal: boolean;
}) {
  return (
    <section>
      <SectionHeader>
        Line Items
        {isTerminal && (
          <span className="ml-2 text-[10px] font-normal text-muted-foreground">
            (read-only — PO is in terminal state)
          </span>
        )}
      </SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <Th align="left">Product</Th>
              <Th align="left">Mnemonic</Th>
              <Th align="right">Ordered</Th>
              <Th align="right">Accepted</Th>
              <Th align="right">Rejected</Th>
              <Th align="right">Remaining</Th>
              <Th align="right">Unit Cost</Th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line, i) => {
              const remaining =
                line.orderedQty -
                line.receivedAcceptedQty -
                line.rejectedQty;

              return (
                <tr
                  key={line.id}
                  className={`border-b border-border ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <td className="px-3 py-1.5">
                    <div className="text-sm">{line.productName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {line.sku}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary">
                      {line.mnemonicSku}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {line.orderedQty}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-success font-medium">
                    {line.receivedAcceptedQty}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-destructive font-medium">
                    {line.rejectedQty > 0 ? line.rejectedQty : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {remaining > 0 ? (
                      <span className="text-warning">{remaining}</span>
                    ) : (
                      <span className="text-success">0</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {line.unitCost}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
 * RECEIPT HISTORY — Append-only audit trail
 * ══════════════════════════════════════════════════════════ */
function ReceiptHistory({ po }: { po: PODetail }) {
  // Build a product name lookup from PO lines
  const productNames = useMemo(() => {
    const map = new Map<string, { name: string; mnemonic: string }>();
    for (const line of po.lines) {
      map.set(line.id, {
        name: line.productName,
        mnemonic: line.mnemonicSku,
      });
    }
    return map;
  }, [po.lines]);

  return (
    <section>
      <SectionHeader>Receipt History</SectionHeader>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </th>
              <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Product
              </th>
              <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Accepted
              </th>
              <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rejected
              </th>
              <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cost
              </th>
              <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {po.receiptEvents.map((event, i) => {
              const product = productNames.get(event.poLineId);
              return (
                <tr
                  key={event.id}
                  className={`border-b border-border ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                    {new Date(event.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-1.5">
                    {product && (
                      <span className="rounded bg-primary/10 px-1 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary">
                        {product.mnemonic}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-success font-medium">
                    {event.receivedAcceptedQty > 0
                      ? `+${event.receivedAcceptedQty}`
                      : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-destructive font-medium">
                    {event.rejectedQty > 0
                      ? `-${event.rejectedQty}`
                      : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {event.unitCost}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">
                    {event.notes ?? "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
 * ACTION BUTTONS — Submit, Cancel, Close Variance
 * ══════════════════════════════════════════════════════════ */
function SubmitPOButton({ po }: { po: PODetail }) {
  const { token, locationId } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const mut = useSubmitPOMutation(token, locationId, po.poNo);

  useEffect(() => {
    if (mut.status === "success" || mut.status === "already_processed") {
      const timer = setTimeout(() => {
        mut.reset();
        setConfirming(false);
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [mut.status, mut]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Submit PO
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {mut.statusMessage && (
        <span
          className={`text-xs font-medium ${
            mut.status === "success"
              ? "text-success"
              : mut.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {mut.statusMessage}
        </span>
      )}
      <button
        onClick={() => mut.submit(po.id, {})}
        disabled={mut.isSubmitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        {mut.isSubmitting ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Submitting...
          </span>
        ) : (
          "Confirm Submit"
        )}
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          mut.reset();
        }}
        disabled={mut.isSubmitting}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}

function CancelPOButton({ po }: { po: PODetail }) {
  const { token, locationId } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");
  const mut = useCancelPOMutation(token, locationId, po.poNo);

  useEffect(() => {
    if (mut.status === "success" || mut.status === "already_processed") {
      const timer = setTimeout(() => {
        mut.reset();
        setConfirming(false);
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [mut.status, mut]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
      >
        Cancel PO
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {mut.statusMessage && (
        <span
          className={`text-xs font-medium ${
            mut.status === "success"
              ? "text-success"
              : mut.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {mut.statusMessage}
        </span>
      )}
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Cancellation reason..."
        disabled={mut.isSubmitting}
        className="w-48 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
      />
      <button
        onClick={() =>
          mut.submit(po.id, { notes: notes.trim() || undefined })
        }
        disabled={mut.isSubmitting}
        className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-40"
      >
        {mut.isSubmitting ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Cancelling...
          </span>
        ) : (
          "Confirm Cancel"
        )}
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          mut.reset();
        }}
        disabled={mut.isSubmitting}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}

function CloseVarianceButton({ po }: { po: PODetail }) {
  const { token, locationId } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");
  const mut = useCloseVariancePOMutation(token, locationId, po.poNo);

  useEffect(() => {
    if (mut.status === "success" || mut.status === "already_processed") {
      const timer = setTimeout(() => {
        mut.reset();
        setConfirming(false);
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [mut.status, mut]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-warning px-4 py-2 text-sm font-medium text-warning hover:bg-warning/10"
      >
        Close with Variance
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {mut.statusMessage && (
        <span
          className={`text-xs font-medium ${
            mut.status === "success"
              ? "text-success"
              : mut.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {mut.statusMessage}
        </span>
      )}
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Variance notes..."
        disabled={mut.isSubmitting}
        className="w-48 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
      />
      <button
        onClick={() =>
          mut.submit(po.id, { notes: notes.trim() || undefined })
        }
        disabled={mut.isSubmitting}
        className="rounded-md bg-warning px-4 py-2 text-sm font-medium text-white hover:bg-warning/90 disabled:opacity-40"
      >
        {mut.isSubmitting ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Closing...
          </span>
        ) : (
          "Confirm Close"
        )}
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          mut.reset();
        }}
        disabled={mut.isSubmitting}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Shared Sub-Components
 * ───────────────────────────────────────────── */

function InfoChip({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="flex-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold">{primary}</div>
      {secondary && (
        <div className="font-mono text-[10px] text-muted-foreground">
          {secondary}
        </div>
      )}
    </div>
  );
}

function TimelineCard({
  label,
  date,
}: {
  label: string;
  date: string | null;
}) {
  return (
    <div className="rounded-md border border-border/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-xs font-medium tabular-nums">
        {date
          ? new Date(date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "\u2014"}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function Th({
  children,
  align,
  width,
}: {
  children?: React.ReactNode;
  align: "left" | "right";
  width?: string;
}) {
  return (
    <th
      className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      } ${width ?? ""}`}
    >
      {children}
    </th>
  );
}

function MutationStatusBanner({
  status,
  message,
}: {
  status: POMutationStatus;
  message: string;
}) {
  const styles: Record<string, string> = {
    submitting: "bg-primary/5 border-primary/20 text-primary",
    success: "bg-success/10 border-success/20 text-success",
    already_processed: "bg-warning/10 border-warning/20 text-warning",
    contention_retry: "bg-warning/10 border-warning/20 text-warning",
    needs_reconcile:
      "bg-destructive/10 border-destructive/20 text-destructive",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
  };

  return (
    <div
      className={`mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
        styles[status] ?? ""
      }`}
    >
      {status === "submitting" && <Spinner />}
      <span>{message}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
