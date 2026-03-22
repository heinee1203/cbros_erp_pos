"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Printer, Pencil, Trash2, Plus, Search, X, Save, Loader2, ArrowRightLeft } from "lucide-react";
import {
  usePOQuery,
  usePOReceipts,
  type PODetail,
  type POLine,
  type POReceipt,
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
import { useSuppliers } from "@/hooks/use-suppliers";
import { useLocations } from "@/hooks/use-locations";
import { useProducts, type ProductRow } from "@/hooks/use-products";
import { apiFetch } from "@/lib/api";

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

/** States that allow editing header + lines */
const EDITABLE_STATES = new Set(["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"]);

/** Print a PO receiving slip for a specific receipt */
function printReceivingSlip(receipt: any, po: any) {
  const w = window.open("", "_blank");
  if (!w) return;

  const itemRows = (receipt.lines || []).map((line: any, i: number) => `
    <tr>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:center">${i + 1}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc">${line.productName || "\u2014"}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;font-family:monospace;font-size:10px">${line.sku || line.mnemonicSku || "\u2014"}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right">${line.receivedAcceptedQty ?? 0}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;${(line.rejectedQty ?? 0) > 0 ? "color:#dc2626;font-weight:bold" : ""}">${line.rejectedQty ?? 0}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;font-size:10px">\u20B1${parseFloat(line.unitCost ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
    </tr>`).join("");

  const receiptAmount = (receipt.lines || []).reduce((sum: number, l: any) =>
    sum + ((l.receivedAcceptedQty ?? 0) * parseFloat(l.unitCost ?? "0")), 0);

  const dateStr = receipt.createdAt
    ? new Date(receipt.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "\u2014";

  const html = `<!DOCTYPE html>
<html><head><title>Receiving Slip \u2014 ${po.poNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:11px;padding:20px;color:#000;max-width:800px;margin:0 auto}
.hdr{text-align:center;border-top:3px double #000;border-bottom:3px double #000;padding:10px 0;margin-bottom:16px}
.hdr h1{font-size:15px;letter-spacing:2px;margin-bottom:2px}
.hdr h2{font-size:10px;font-weight:normal;color:#444}
.meta{margin-bottom:14px;line-height:1.7}
.mr{display:flex}.ml{display:inline-block;width:90px;font-weight:bold;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
th{text-align:left;border-bottom:2px solid #000;padding:3px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.tot{margin:10px 0;padding-top:6px;border-top:2px solid #000;line-height:1.6}
.tot .amt{font-size:13px;font-weight:bold;margin-top:4px}
.disc{margin:16px 0;padding:10px;border:1px solid #999}
.disc h3{font-size:11px;margin-bottom:8px;letter-spacing:1px}
.cb{display:inline-block;width:14px;height:14px;border:1.5px solid #000;margin-right:6px;vertical-align:middle}
.cbr{margin-bottom:4px;font-size:11px}
.nl{border-bottom:1px solid #000;width:100%;height:20px;margin-top:8px}
.sig{margin-top:24px}
.sig h3{font-size:11px;margin-bottom:14px;letter-spacing:1px}
.sl{border-bottom:1px solid #000;width:220px;display:inline-block;margin-right:16px}
.dl{border-bottom:1px solid #000;width:120px;display:inline-block}
.slbl{font-size:9px;color:#666;margin-top:2px;padding-left:40px}
.ftr{border-top:3px double #000;margin-top:20px;padding-top:6px;text-align:center;font-size:9px;color:#666}
@media print{body{padding:0}@page{margin:15mm;size:A4}}
</style></head><body>
<div class="hdr"><h1>PO RECEIVING SLIP</h1><h2>Attach to Supplier Delivery Receipt</h2></div>
<div class="meta">
  <div class="mr"><span class="ml">PO No:</span>${po.poNo}</div>
  <div class="mr"><span class="ml">DR No:</span>${receipt.supplierDrNo || "\u2014"}</div>
  <div class="mr"><span class="ml">Supplier:</span>${po.supplier?.name || "\u2014"}</div>
  <div class="mr"><span class="ml">Received at:</span>${po.destination?.name || "\u2014"}${po.destination?.code ? " (" + po.destination.code + ")" : ""}</div>
  <div class="mr"><span class="ml">Date:</span>${dateStr}</div>
  <div class="mr"><span class="ml">Received by:</span>${receipt.receivedByName || receipt.receivedBy || "\u2014"}</div>
</div>
<h3 style="font-size:11px;letter-spacing:1px;margin-bottom:4px">ITEMS RECEIVED</h3>
<table><thead><tr>
  <th style="width:30px;text-align:center">#</th><th>Item</th><th>SKU</th>
  <th style="width:55px;text-align:right">Accepted</th>
  <th style="width:55px;text-align:right">Rejected</th>
  <th style="width:65px;text-align:right">Unit Cost</th>
</tr></thead><tbody>${itemRows}</tbody></table>
<div class="tot">
  <div>Total: ${receipt.lineCount ?? receipt.lines?.length ?? 0} lines, ${receipt.totalAcceptedQty ?? 0} accepted${(receipt.totalRejectedQty ?? 0) > 0 ? ", " + receipt.totalRejectedQty + " rejected" : ""}</div>
  <div class="amt">Receipt Amount: \u20B1${receiptAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
</div>
<div class="disc">
  <h3>DISCREPANCIES</h3>
  <div class="cbr"><span class="cb"></span> All items match DR</div>
  <div class="cbr"><span class="cb"></span> Short delivery</div>
  <div class="cbr"><span class="cb"></span> Damaged items</div>
  <div class="cbr"><span class="cb"></span> Wrong items</div>
  <div style="margin-top:8px">Notes:</div><div class="nl"></div><div class="nl"></div>
</div>
<div class="sig"><h3>ACKNOWLEDGMENT</h3>
  <div style="margin-bottom:20px">Checked by: <span class="sl"></span> Date: <span class="dl"></span>
    <div class="slbl">(Warehouse Staff)</div>
  </div>
</div>
<div class="ftr">Printed: ${new Date().toLocaleString("en-PH")} \u2014 Apex Auto Parts</div>
</body></html>`;

  w.document.write(html);
  w.document.close();
}

/** Batch print all receipts for a PO — one page per receipt with CSS page breaks */
function printAllReceivingSlips(receipts: any[], po: any) {
  if (receipts.length === 0) return;
  const w = window.open("", "_blank");
  if (!w) return;

  const totalReceipts = receipts.length;
  const slipPages = receipts.map((receipt: any, pageIndex: number) => {
    const itemRows = (receipt.lines || []).map((line: any, i: number) => `
      <tr>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:center">${i + 1}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc">${line.productName || "\u2014"}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;font-family:monospace;font-size:10px">${line.sku || line.mnemonicSku || "\u2014"}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right">${line.receivedAcceptedQty ?? 0}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;${(line.rejectedQty ?? 0) > 0 ? "color:#dc2626;font-weight:bold" : ""}">${line.rejectedQty ?? 0}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;font-size:10px">\u20B1${parseFloat(line.unitCost ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
      </tr>`).join("");

    const receiptAmount = (receipt.lines || []).reduce((sum: number, l: any) =>
      sum + ((l.receivedAcceptedQty ?? 0) * parseFloat(l.unitCost ?? "0")), 0);
    const totalAccepted = receipt.totalAcceptedQty ?? (receipt.lines || []).reduce((s: number, l: any) => s + (l.receivedAcceptedQty ?? 0), 0);
    const totalRejected = receipt.totalRejectedQty ?? (receipt.lines || []).reduce((s: number, l: any) => s + (l.rejectedQty ?? 0), 0);
    const dateStr = receipt.createdAt
      ? new Date(receipt.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
      : "\u2014";

    return `<div class="slip${pageIndex > 0 ? " page-break" : ""}">
<div class="hdr"><h1>PO RECEIVING SLIP</h1><h2>Attach to Supplier Delivery Receipt</h2>${totalReceipts > 1 ? `<div style="font-size:10px;color:#666;margin-top:4px">Receipt ${pageIndex + 1} of ${totalReceipts}</div>` : ""}</div>
<div class="meta">
  <div class="mr"><span class="ml">PO No:</span>${po.poNo}</div>
  <div class="mr"><span class="ml">DR No:</span>${receipt.supplierDrNo || "\u2014"}</div>
  <div class="mr"><span class="ml">Supplier:</span>${po.supplier?.name || "\u2014"}</div>
  <div class="mr"><span class="ml">Received at:</span>${po.destination?.name || "\u2014"}${po.destination?.code ? " (" + po.destination.code + ")" : ""}</div>
  <div class="mr"><span class="ml">Date:</span>${dateStr}</div>
  <div class="mr"><span class="ml">Received by:</span>${receipt.receivedByName || "\u2014"}</div>
</div>
<h3 style="font-size:11px;letter-spacing:1px;margin-bottom:4px">ITEMS RECEIVED</h3>
<table><thead><tr>
  <th style="width:30px;text-align:center">#</th><th>Item</th><th>SKU</th>
  <th style="width:55px;text-align:right">Accepted</th>
  <th style="width:55px;text-align:right">Rejected</th>
  <th style="width:65px;text-align:right">Unit Cost</th>
</tr></thead><tbody>${itemRows}</tbody></table>
<div class="tot">
  <div>Total: ${receipt.lines?.length ?? 0} lines, ${totalAccepted} accepted${totalRejected > 0 ? ", " + totalRejected + " rejected" : ""}</div>
  <div class="amt">Receipt Amount: \u20B1${receiptAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
</div>
<div class="disc">
  <h3>DISCREPANCIES</h3>
  <div class="cbr"><span class="cb"></span> All items match DR</div>
  <div class="cbr"><span class="cb"></span> Short delivery</div>
  <div class="cbr"><span class="cb"></span> Damaged items</div>
  <div class="cbr"><span class="cb"></span> Wrong items</div>
  <div style="margin-top:8px">Notes:</div><div class="nl"></div><div class="nl"></div>
</div>
<div class="sig"><h3>ACKNOWLEDGMENT</h3>
  <div style="margin-bottom:20px">Checked by: <span class="sl"></span> Date: <span class="dl"></span>
    <div class="slbl">(Warehouse Staff)</div>
  </div>
</div>
<div class="ftr">Printed: ${new Date().toLocaleString("en-PH")} \u2014 Apex Auto Parts</div>
</div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><title>Receiving Slips \u2014 ${po.poNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:11px;padding:20px;color:#000;max-width:800px;margin:0 auto}
.slip{padding-bottom:20px}
.page-break{page-break-before:always}
.hdr{text-align:center;border-top:3px double #000;border-bottom:3px double #000;padding:10px 0;margin-bottom:16px}
.hdr h1{font-size:15px;letter-spacing:2px;margin-bottom:2px}
.hdr h2{font-size:10px;font-weight:normal;color:#444}
.meta{margin-bottom:14px;line-height:1.7}
.mr{display:flex}.ml{display:inline-block;width:90px;font-weight:bold;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
th{text-align:left;border-bottom:2px solid #000;padding:3px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.tot{margin:10px 0;padding-top:6px;border-top:2px solid #000;line-height:1.6}
.tot .amt{font-size:13px;font-weight:bold;margin-top:4px}
.disc{margin:16px 0;padding:10px;border:1px solid #999}
.disc h3{font-size:11px;margin-bottom:8px;letter-spacing:1px}
.cb{display:inline-block;width:14px;height:14px;border:1.5px solid #000;margin-right:6px;vertical-align:middle}
.cbr{margin-bottom:4px;font-size:11px}
.nl{border-bottom:1px solid #000;width:100%;height:20px;margin-top:8px}
.sig{margin-top:24px}
.sig h3{font-size:11px;margin-bottom:14px;letter-spacing:1px}
.sl{border-bottom:1px solid #000;width:220px;display:inline-block;margin-right:16px}
.dl{border-bottom:1px solid #000;width:120px;display:inline-block}
.slbl{font-size:9px;color:#666;margin-top:2px;padding-left:40px}
.ftr{border-top:3px double #000;margin-top:20px;padding-top:6px;text-align:center;font-size:9px;color:#666}
@media print{body{padding:0}@page{margin:15mm;size:A4}.page-break{page-break-before:always}}
</style></head><body>${slipPages}</body></html>`;

  w.document.write(html);
  w.document.close();
}

/** Calculate net cost from list price through a chain of trade discounts */
function calculateNetCost(listPrice: number, discountChain: string): number {
  if (!listPrice || listPrice <= 0) return 0;
  const discounts = discountChain
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((d) => !isNaN(d) && d > 0 && d < 100);
  let net = listPrice;
  for (const discount of discounts) {
    net = net * (1 - discount / 100);
  }
  return Math.round(net * 100) / 100;
}

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
        productName: l.productName,
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

  // Add a new line from product search
  const addLine = useCallback((product: ProductRow) => {
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setEditLines((prev) => [
      ...prev,
      {
        id: tempId,
        productId: product.id,
        productName: product.name,
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
    ]);
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
                <Link
                  href={`/inventory/barcode-printing?poNo=${encodeURIComponent(po.poNo)}`}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Printer size={14} />
                  Print Barcodes
                </Link>
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

      {/* ── Route: Supplier → Destination ── */}
      {isEditing ? (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4 space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Header Details
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Supplier
              </label>
              <select
                value={editSupplierId}
                onChange={(e) => setEditSupplierId(e.target.value)}
                disabled={isPartiallyReceived}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Destination
              </label>
              <select
                value={editDestinationId}
                onChange={(e) => setEditDestinationId(e.target.value)}
                disabled={isPartiallyReceived}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Expected Delivery
              </label>
              <input
                type="date"
                value={editExpectedDate}
                onChange={(e) => setEditExpectedDate(e.target.value)}
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Notes
              </label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional notes..."
                className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          </div>
        </div>
      ) : (
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
      )}

      {/* ── Timeline ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TimelineCard label="Created" date={po.createdAt} />
        <TimelineCard label="Submitted" date={po.submittedAt} />
        <TimelineCard label="Closed" date={po.closedAt} />
        <TimelineCard label="Cancelled" date={po.cancelledAt} />
      </div>

      {/* ── Receipt Progress Bar ── */}
      {!isDraft && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{totalOrdered} items ordered</span>
            <span className="text-muted-foreground">
              {totalReceived} received
              {totalRejected > 0 && ` \u00b7 ${totalRejected} rejected`}
              {totalRemaining > 0 && ` \u00b7 ${totalRemaining} remaining`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${pctReceived}%` }}
            />
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {pctReceived}% received
          </div>
        </div>
      )}

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
        <ReceiptHistory po={po} receipts={allReceipts} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRedirectModal(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Redirect Unfulfilled Items</h3>
              <button onClick={() => setShowRedirectModal(false)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X size={14} /></button>
            </div>

            {redirectLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading redirect plan...</span>
              </div>
            )}

            {redirectError && (
              <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{redirectError}</div>
            )}

            {redirectPlan && !redirectLoading && (
              <>
                <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                  {(redirectPlan.items ?? []).map((item: any) => (
                    <div key={item.lineId} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{item.productName}</span>
                          <span className="ml-2 text-xs text-muted-foreground">SKU: {item.sku}</span>
                        </div>
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          {item.unfulfilledQty} unfulfilled
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`redirect-${item.lineId}`}
                            value="skip"
                            checked={redirectSelections[item.lineId] === "skip"}
                            onChange={() => setRedirectSelections((prev) => ({ ...prev, [item.lineId]: "skip" }))}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs text-muted-foreground">Skip (do not redirect)</span>
                        </label>
                        {(item.alternateSuppliers ?? []).map((alt: any) => (
                          <label key={alt.supplierId} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`redirect-${item.lineId}`}
                              value={alt.supplierId}
                              checked={redirectSelections[item.lineId] === alt.supplierId}
                              onChange={() => setRedirectSelections((prev) => ({ ...prev, [item.lineId]: alt.supplierId }))}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-xs">
                              {alt.supplierName}
                              {alt.cost && <span className="ml-1 text-muted-foreground">(&#8369;{parseFloat(alt.cost).toLocaleString()})</span>}
                              {alt.leadTimeDays && <span className="ml-1 text-muted-foreground">{alt.leadTimeDays}d lead</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="mt-4 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {Object.values(redirectSelections).filter((v) => v !== "skip").length} of{" "}
                  {(redirectPlan.items ?? []).length} items selected for redirect
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setShowRedirectModal(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateRedirectPOs}
                    disabled={redirectCreating || Object.values(redirectSelections).every((v) => v === "skip")}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                  >
                    {redirectCreating && <Loader2 size={12} className="animate-spin" />}
                    Create Redirect PO(s)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
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
    checked: boolean;
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
          checked: false,
        };
      }
      return init;
    },
  );

  const [scanValue, setScanValue] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [supplierDrNo, setSupplierDrNo] = useState("");
  const [drError, setDrError] = useState<string | null>(null);

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
        };
      });

    receiveMut.submit(po.id, {
      supplierDrNo: supplierDrNo.trim(),
      lines,
      notes: receiptNotes.trim() || undefined,
    });
  }, [hasValidLines, hasAnyErrors, receiveMut, receivableLines, lineStates, po.id, receiptNotes, supplierDrNo]);

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
            placeholder="Scan barcode or type SKU \u2026 press Enter"
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
                      className="max-w-[180px] truncate text-xs font-medium"
                      title={line.productName}
                    >
                      {line.productName}
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
          disabled={!hasValidLines || hasAnyErrors || !supplierDrNo.trim() || receiveMut.isSubmitting}
          className="rounded-md bg-success px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {receiveMut.isSubmitting ? (
            <span className="flex items-center gap-2"><Spinner /> Posting Receipt...</span>
          ) : supplierDrNo.trim() ? (
            `Post Receipt for ${supplierDrNo.trim()}`
          ) : (
            "Post Receipt"
          )}
        </button>
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
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
 * READ-ONLY GRID — For DRAFT, terminal states (FULLY_RECEIVED, etc.)
 * ══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
 * EDITABLE GRID — Inline editing of PO lines
 * ══════════════════════════════════════════════════════════ */
function EditableGrid({
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
  setEditLines: React.Dispatch<React.SetStateAction<any[]>>;
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
                    <div className="text-sm font-medium">{line.productName}</div>
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
                          className="h-7 w-24 rounded border border-border bg-background px-2 text-right text-[12px] tabular-nums outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
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

/* ── Product Search (inline in editable grid footer) ── */
function ProductSearchInline({ onSelect }: { onSelect: (product: ProductRow) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { token, locationId } = useAuth();

  const { data } = useProducts(token, locationId, {
    search: query,
    limit: 8,
    allLocations: true,
  });
  const results = data?.data ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center gap-2">
      <div className="relative">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(e.target.value.length >= 2);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Search product to add..."
          className="h-7 w-64 rounded border border-border bg-background pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
        />
      </div>
      {open && query.length >= 2 && results.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-96 rounded-lg border border-border bg-background shadow-lg max-h-60 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onSelect(p);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent transition-colors"
            >
              <div>
                <div className="font-medium text-foreground">{p.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {p.sku}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Cost: {p.costPrice || "—"}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-lg">
          No products found
        </div>
      )}
    </div>
  );
}

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
              <Th align="left">Item</Th>
              <Th align="right">Ordered</Th>
              <Th align="right">List Price</Th>
              <Th align="right">Discount</Th>
              <Th align="right">Net Cost</Th>
              <Th align="right">Accepted</Th>
              <Th align="right">Rejected</Th>
              <Th align="right">Remaining</Th>
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
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {line.orderedQty}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {line.listPrice ? `\u20B1${line.listPrice}` : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {line.discountChain
                      ? line.discountChain.split(",").map((s) => s.trim()).join("/")
                      : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {line.unitCost}
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
 * RECEIPT HISTORY — Grouped by DR number, collapsible cards
 * ══════════════════════════════════════════════════════════ */
function ReceiptHistory({ po, receipts = [] }: { po: PODetail; receipts?: any[] }) {

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Expand first receipt on initial load
  useEffect(() => {
    if (receipts.length > 0 && expandedIds.size === 0) {
      setExpandedIds(new Set([receipts[0].id]));
    }
  }, [receipts]);

  const toggleReceipt = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Fallback for pre-feature receipts
  if (receipts.length === 0 && po.receiptEvents.length > 0) {
    return <LegacyReceiptHistory po={po} />;
  }
  if (receipts.length === 0) return null;

  return (
    <section>
      <SectionHeader>
        Receipt History ({receipts.length} receipt{receipts.length !== 1 ? "s" : ""})
      </SectionHeader>
      <div className="space-y-3">
        {receipts.map((receipt) => {
          const isExpanded = expandedIds.has(receipt.id);
          return (
            <div key={receipt.id} className="overflow-hidden rounded-lg border border-border">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleReceipt(receipt.id)}
                className="flex w-full cursor-pointer items-center justify-between bg-muted/40 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <div>
                  <span className="text-sm font-bold text-foreground">{receipt.supplierDrNo}</span>
                  <span className="ml-3 text-xs text-muted-foreground">
                    Received by {receipt.receivedBy} &middot; {receipt.lineCount} line{receipt.lineCount !== 1 ? "s" : ""} &middot; {receipt.totalAcceptedQty} units accepted
                    {receipt.totalRejectedQty > 0 && ` \u00b7 ${receipt.totalRejectedQty} rejected`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); printReceivingSlip(receipt, po); }}
                    className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Print Slip
                  </button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {new Date(receipt.createdAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  <svg className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30">
                        <th scope="col" className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Accepted</th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rejected</th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit Cost</th>
                        <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.lines.map((line, i) => (
                        <tr key={i} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                          <td className="px-4 py-1.5">
                            <div className="text-xs font-medium">{line.productName}</div>
                            <div className="flex items-center gap-1.5 mt-px">
                              <span className="font-mono text-[10px] text-muted-foreground">{line.sku}</span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-success font-medium">
                            {line.acceptedQty > 0 ? `+${line.acceptedQty}` : "\u2014"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-destructive font-medium">
                            {line.rejectedQty > 0 ? `-${line.rejectedQty}` : "\u2014"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{line.unitCost}</td>
                          <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">{line.notes ?? "\u2014"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {receipt.notes && (
                    <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                      <strong>Notes:</strong> {receipt.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
 * LEGACY RECEIPT HISTORY — Flat append-only audit trail (pre-grouped receipts)
 * ══════════════════════════════════════════════════════════ */
function LegacyReceiptHistory({ po }: { po: PODetail }) {
  // Build a product name lookup from PO lines
  const productNames = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const line of po.lines) {
      map.set(line.id, {
        name: line.productName,
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
                Item
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
                    {product?.name}
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
