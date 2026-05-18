"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Printer, Pencil, X, Save, Loader2, ArrowRightLeft } from "lucide-react";
import {
  usePOQuery,
  usePOReceipts,
  type PODetail,
  type POReceipt,
} from "@/hooks/use-po-query";
import { useAuth } from "@/app/auth-context";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useLocations } from "@/hooks/use-locations";
import type { ProductRow } from "@/hooks/use-products";
import { apiFetch } from "@/lib/api";
import {
  EDITABLE_STATES,
  RECEIVABLE_STATES,
  STATUS_LABELS,
  STATUS_STYLES,
  TERMINAL_STATES,
} from "./constants";
import { printAllReceivingSlips, printPurchaseOrder, printReceivingSlip } from "./print-utils";
import { CancelPOButton, CloseVarianceButton, SubmitPOButton } from "./components/action-buttons";
import { POHeaderDetails } from "./components/header-details";
import { ReceiptHistory } from "./components/receipt-history";
import { RedirectUnfulfilledModal } from "./components/redirect-unfulfilled-modal";
import { ReadOnlyGrid } from "./components/read-only-grid";
import { ReceivingGrid } from "./components/receiving-grid";
import { EditableGrid } from "./components/editable-grid";
import { SectionHeader } from "./components/shared";

export default function PODetailPage() {
  const params = useParams<{ poNo: string }>();
  const poNo = params?.poNo as string;
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
  const { token, locationId } = useAuth();
  const receiptsQuery = usePOReceipts(po.id, token, locationId);
  const allReceipts = receiptsQuery.data?.data ?? [];
  const isTerminal = TERMINAL_STATES.has(po.status);
  const canReceive = RECEIVABLE_STATES.has(po.status);
  const canEdit = EDITABLE_STATES.has(po.status);
  const isDraft = po.status === "DRAFT";

  const totalOrdered = po.lines.reduce((sum, l) => sum + l.orderedQty, 0);
  const totalReceived = po.lines.reduce((sum, l) => sum + l.receivedAcceptedQty, 0);
  const totalRejected = po.lines.reduce((sum, l) => sum + l.rejectedQty, 0);
  const totalRemaining = totalOrdered - totalReceived - totalRejected;
  const pctReceived = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  // ── Edit Mode State ──
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Header edit form
  const [editSupplierId, setEditSupplierId] = useState(po.supplierId);
  const [editDestinationId, setEditDestinationId] = useState(po.destinationLocationId);
  const [editExpectedDate, setEditExpectedDate] = useState(
    po.expectedDeliveryDate ? po.expectedDeliveryDate.split("T")[0] : "",
  );
  const [editNotes, setEditNotes] = useState(po.notes ?? "");

  // Lines edit state
  interface EditLine {
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
  }
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);

  // Initialize edit state when entering edit mode
  const enterEditMode = useCallback(() => {
    setEditSupplierId(po.supplierId);
    setEditDestinationId(po.destinationLocationId);
    setEditExpectedDate(po.expectedDeliveryDate ? po.expectedDeliveryDate.split("T")[0] : "");
    setEditNotes(po.notes ?? "");
    setEditLines(
      po.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        productName: (l as any).parentName ? `${(l as any).parentName} (${l.productName})` : l.productName,
        sku: l.sku,
        orderedQty: l.orderedQty,
        listPrice: l.listPrice ?? l.unitCost,
        discountChain: l.discountChain ?? "",
        unitCost: l.unitCost,
        isManualCost: !l.discountChain,
        receivedAcceptedQty: l.receivedAcceptedQty,
        rejectedQty: l.rejectedQty,
      })),
    );
    setDeletedLineIds([]);
    setEditError(null);
    setIsEditing(true);
  }, [po]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditError(null);
  }, []);

  // Fetch suppliers and locations for dropdowns
  const suppliersQuery = useSuppliers(token, locationId);
  const locationsQuery = useLocations(token);
  const suppliers = suppliersQuery.data?.data ?? [];
  const locations = locationsQuery.data?.data ?? [];

  // Remove a line
  const removeLine = useCallback((lineId: string, isNew?: boolean) => {
    setEditLines((prev) => prev.filter((l) => l.id !== lineId));
    if (!isNew) {
      setDeletedLineIds((prev) => [...prev, lineId]);
    }
  }, []);

  // Add a new line from product search (with duplicate check + parent name)
  const addLine = useCallback((product: ProductRow) => {
    const displayName = (product as any).parentName
      ? `${(product as any).parentName} (${product.name})`
      : product.name;

    // Duplicate check — if product already in PO, prompt to add qty
    setEditLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        const addQty = parseInt(prompt(`"${displayName}" is already in this PO with ${existing.orderedQty} pcs.\n\nAdditional quantity to add (0 to cancel):`) || "0", 10);
        if (addQty > 0) {
          return prev.map((l) => l.id === existing.id ? { ...l, orderedQty: l.orderedQty + addQty } : l);
        }
        return prev; // cancelled
      }

      return [
        ...prev,
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: product.id,
          productName: displayName,
          sku: product.sku,
          orderedQty: 1,
          listPrice: product.costPrice || "0",
          discountChain: "",
          unitCost: product.costPrice || "0",
          isManualCost: false,
          receivedAcceptedQty: 0,
          rejectedQty: 0,
          isNew: true,
        },
      ].sort((a, b) => a.productName.localeCompare(b.productName));
    });
  }, []);

  // Save all edits
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setEditError(null);
    try {
      // 1. PATCH header
      await apiFetch(`/procurement/purchase-orders/${po.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          supplierId: editSupplierId,
          destinationLocationId: editDestinationId,
          expectedDeliveryDate: editExpectedDate || null,
          notes: editNotes || null,
        }),
        token,
        locationId,
      });

      // 2. Delete removed lines
      for (const lineId of deletedLineIds) {
        await apiFetch(
          `/procurement/purchase-orders/${po.id}/lines/${lineId}`,
          { method: "DELETE", token, locationId },
        );
      }

      // 3. Update/add lines
      for (const line of editLines) {
        if (line.isNew) {
          await apiFetch(`/procurement/purchase-orders/${po.id}/lines`, {
            method: "POST",
            body: JSON.stringify({
              productId: line.productId,
              orderedQty: line.orderedQty,
              unitCost: line.unitCost,
              listPrice: line.listPrice || null,
              discountChain: line.discountChain || null,
            }),
            token,
            locationId,
          });
        } else {
          // Check if line was modified
          const original = po.lines.find((l) => l.id === line.id);
          if (
            original &&
            (original.orderedQty !== line.orderedQty ||
              original.unitCost !== line.unitCost ||
              (original.listPrice ?? "") !== line.listPrice ||
              (original.discountChain ?? "") !== line.discountChain)
          ) {
            await apiFetch(
              `/procurement/purchase-orders/${po.id}/lines/${line.id}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  orderedQty: line.orderedQty,
                  unitCost: line.unitCost,
                  listPrice: line.listPrice || null,
                  discountChain: line.discountChain || null,
                }),
                token,
                locationId,
              },
            );
          }
        }
      }

      setIsEditing(false);
      refetch();
    } catch (err: any) {
      setEditError(err.message || "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }, [
    po, editSupplierId, editDestinationId, editExpectedDate, editNotes,
    editLines, deletedLineIds, token, locationId, refetch,
  ]);

  // Grand total for edit mode
  const editGrandTotal = useMemo(
    () =>
      editLines.reduce(
        (sum, l) => sum + l.orderedQty * (parseFloat(l.unitCost) || 0),
        0,
      ),
    [editLines],
  );

  const isPartiallyReceived = po.status === "PARTIALLY_RECEIVED";

  // ── Redirect Unfulfilled Modal ──
  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [redirectPlan, setRedirectPlan] = useState<any>(null);
  const [redirectLoading, setRedirectLoading] = useState(false);
  const [redirectSelections, setRedirectSelections] = useState<Record<string, string>>({});
  const [redirectCreating, setRedirectCreating] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  const openRedirectModal = useCallback(async () => {
    setShowRedirectModal(true);
    setRedirectLoading(true);
    setRedirectError(null);
    try {
      const result = await apiFetch<{ data: any }>(`/procurement/purchase-orders/${po.id}/redirect-plan`, {
        method: "POST",
        token,
        locationId,
      });
      setRedirectPlan(result.data);
      // Default selections: first alternate supplier for each item, or "skip"
      const defaults: Record<string, string> = {};
      for (const item of result.data?.items ?? []) {
        defaults[item.lineId] = item.alternateSuppliers?.[0]?.supplierId ?? "skip";
      }
      setRedirectSelections(defaults);
    } catch (e: any) {
      setRedirectError(e?.message || "Failed to load redirect plan");
    } finally {
      setRedirectLoading(false);
    }
  }, [po.id, token, locationId]);

  const handleCreateRedirectPOs = useCallback(async () => {
    setRedirectCreating(true);
    setRedirectError(null);
    try {
      const lines = Object.entries(redirectSelections)
        .filter(([, supplierId]) => supplierId !== "skip")
        .map(([lineId, supplierId]) => ({ lineId, supplierId }));
      if (lines.length === 0) {
        setRedirectError("Select at least one supplier to redirect to");
        setRedirectCreating(false);
        return;
      }
      await apiFetch(`/procurement/purchase-orders/${po.id}/create-redirect-pos`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({ lines }),
      });
      setShowRedirectModal(false);
      setRedirectPlan(null);
      refetch();
    } catch (e: any) {
      setRedirectError(e?.message || "Failed to create redirect POs");
    } finally {
      setRedirectCreating(false);
    }
  }, [po.id, redirectSelections, token, locationId, refetch]);

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
            {!isEditing && (
              <span className="text-xs text-muted-foreground">
                Supplier: <strong>{po.supplier.name}</strong>
              </span>
            )}
            {isEditing && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                EDITING
              </span>
            )}
          </div>
        </div>
        {/* Action buttons — contextual */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={cancelEdit}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || editLines.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <>
              {po.status !== "CANCELLED" && (
                <>
                  <div className="relative group">
                    <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Printer size={14} />
                      Print PO
                      <svg width="10" height="10" viewBox="0 0 10 10" className="ml-0.5 opacity-50"><path d="M3 4l2 2 2-2" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                    </button>
                    <div className="invisible group-hover:visible absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-background shadow-lg">
                      <button
                        onClick={() => printPurchaseOrder(po, { showPricing: true })}
                        className="w-full px-3 py-2 text-left text-[12px] hover:bg-accent rounded-t-lg"
                      >
                        Print with Pricing
                      </button>
                      <button
                        onClick={() => printPurchaseOrder(po, { showPricing: false })}
                        className="w-full px-3 py-2 text-left text-[12px] hover:bg-accent rounded-b-lg"
                      >
                        Print without Pricing
                      </button>
                    </div>
                  </div>
                  <Link
                    href={`/inventory/barcode-printing?poNo=${encodeURIComponent(po.poNo)}`}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Printer size={14} />
                    Print Barcodes
                  </Link>
                </>
              )}
              {allReceipts.length > 0 && (
                <button
                  onClick={() => printAllReceivingSlips(allReceipts, po)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Printer size={14} />
                  Print Receiving Slip{allReceipts.length > 1 ? `s (${allReceipts.length})` : ""}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={enterEditMode}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Pencil size={14} />
                  Edit PO
                </button>
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
              {(po.status === "PARTIALLY_RECEIVED" || po.status === "CLOSED_WITH_VARIANCE") && (
                <button
                  onClick={openRedirectModal}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  <ArrowRightLeft size={14} /> Redirect Unfulfilled
                </button>
              )}
              {(po.status === "FULLY_RECEIVED" || po.status === "CLOSED_WITH_VARIANCE") && (
                <Link
                  href={`/procurement/transfer-orders/new?fromPoId=${po.id}&sourceLocationId=${po.destinationLocationId}`}
                  className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <ArrowRightLeft size={14} /> Transfer to Another Location
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Edit Error Banner ── */}
      {editError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
          {editError}
        </div>
      )}

      <POHeaderDetails
        po={po}
        isEditing={isEditing}
        isPartiallyReceived={isPartiallyReceived}
        isDraft={isDraft}
        suppliers={suppliers}
        locations={locations}
        editSupplierId={editSupplierId}
        editDestinationId={editDestinationId}
        editExpectedDate={editExpectedDate}
        editNotes={editNotes}
        totalOrdered={totalOrdered}
        totalReceived={totalReceived}
        totalRejected={totalRejected}
        totalRemaining={totalRemaining}
        pctReceived={pctReceived}
        onSupplierChange={setEditSupplierId}
        onDestinationChange={setEditDestinationId}
        onExpectedDateChange={setEditExpectedDate}
        onNotesChange={setEditNotes}
      />

      {/* ── Grid: Edit / Receiving / Read-only ── */}
      {isEditing ? (
        <EditableGrid
          lines={editLines}
          setEditLines={setEditLines}
          isPartiallyReceived={isPartiallyReceived}
          onRemoveLine={removeLine}
          onAddLine={addLine}
          grandTotal={editGrandTotal}
        />
      ) : canReceive ? (
        <ReceivingGrid po={po} refetch={refetch} />
      ) : (
        <ReadOnlyGrid po={po} isTerminal={isTerminal} />
      )}

      {/* ── Receipt Event History ── */}
      {(po.receiptEvents.length > 0 || !isDraft) && (
        <ReceiptHistory po={po} receipts={allReceipts} onPrintReceipt={printReceivingSlip} />
      )}

      {/* ── Notes ── */}
      {po.notes && !isEditing && (
        <section>
          <SectionHeader>Notes</SectionHeader>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {po.notes}
          </p>
        </section>
      )}

      {/* ── Redirect Unfulfilled Modal ── */}
      {showRedirectModal && (
        <RedirectUnfulfilledModal
          redirectPlan={redirectPlan}
          redirectLoading={redirectLoading}
          redirectError={redirectError}
          redirectSelections={redirectSelections}
          redirectCreating={redirectCreating}
          onClose={() => setShowRedirectModal(false)}
          onCreate={handleCreateRedirectPOs}
          onSelectionChange={(lineId, supplierId) => {
            setRedirectSelections((prev) => ({ ...prev, [lineId]: supplierId }));
          }}
        />
      )}
    </div>
  );
}
