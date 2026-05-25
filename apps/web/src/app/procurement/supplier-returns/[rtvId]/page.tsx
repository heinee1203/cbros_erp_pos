"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import {
  useSupplierReturnDetail,
  useSupplierReturnAction,
  useDeleteSupplierReturn,
  useSupplierReturnAttachments,
  useAddSupplierReturnAttachment,
  useDeleteSupplierReturnAttachment,
  type StatusHistoryEntry,
} from "@/hooks/use-supplier-returns";
import { fmtPeso, fmtDate, fmtDateTime } from "@/lib/format";
import { useConfirm } from "@/components/confirm-dialog";

// ── Status Config ──

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-primary/10 text-primary",
  ACKNOWLEDGED: "bg-amber-100 text-amber-700",
  CREDIT_RECEIVED: "bg-green-100 text-green-700",
  CLOSED: "bg-emerald-100 text-emerald-800",
  CLOSED_WITHOUT_CREDIT: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Stock Deducted",
  ACKNOWLEDGED: "Supplier Acknowledged",
  CREDIT_RECEIVED: "Credit Received",
  CLOSED: "Closed",
  CLOSED_WITHOUT_CREDIT: "Closed (No Credit)",
  CANCELLED: "Cancelled",
};

function supplierReturnStatusLabel(status: string, cancelReason?: string | null): string {
  if (status === "CANCELLED" && cancelReason?.startsWith("Supplier rejected:")) {
    return "Rejected / Restocked";
  }
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

const CONDITION_COLORS: Record<string, string> = {
  DEFECTIVE: "bg-red-100 text-red-700",
  DAMAGED: "bg-orange-100 text-orange-700",
  GOOD: "bg-green-100 text-green-700",
  EXPIRED: "bg-yellow-100 text-yellow-700",
  OTHER: "bg-muted text-muted-foreground",
};

const REASON_LABELS: Record<string, string> = {
  DEFECTIVE: "Defective",
  DAMAGED_ON_DELIVERY: "Damaged on Delivery",
  WRONG_ITEM: "Wrong Item",
  OVERSHIPMENT: "Overshipment",
  WARRANTY: "Warranty",
  EXPIRED: "Expired",
  OTHER: "Other",
};

const TIMELINE_DOT_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-400",
  SUBMITTED: "bg-blue-500",
  ACKNOWLEDGED: "bg-amber-500",
  CREDIT_RECEIVED: "bg-green-500",
  CLOSED: "bg-emerald-700",
  CLOSED_WITHOUT_CREDIT: "bg-red-500",
  CANCELLED: "bg-gray-400",
};

// ── Print Return Form ──

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pesoText(value: unknown): string {
  const amount = parseFloat(String(value ?? "0"));
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function supplierReturnLineUnitCost(line: any): number {
  const amount = parseFloat(String(line.costPrice ?? line.costPerUnit ?? "0"));
  return Number.isFinite(amount) ? amount : 0;
}

function numericStockLevel(value: unknown): number {
  const stock = Number(value ?? 0);
  return Number.isFinite(stock) ? stock : 0;
}

function normalizePrintText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function looksLikeInternalSku(value: string): boolean {
  return /^\d{4,}$/.test(value.trim());
}

function extractReturnPartNumber(line: any): string {
  const candidates = [
    normalizePrintText(line.oemNumber),
    normalizePrintText(line.currentSku),
    normalizePrintText(line.sku),
    normalizePrintText(line.productName),
  ];

  for (const candidate of candidates) {
    if (!candidate || looksLikeInternalSku(candidate)) continue;
    const partMatch = candidate.match(/\b[A-Z0-9]{2,}(?:-[A-Z0-9]+)+\b/i);
    if (partMatch) return partMatch[0].toUpperCase();
  }

  return "";
}

function deriveReturnPrintLine(line: any) {
  const partNumber = extractReturnPartNumber(line);
  const rawName = normalizePrintText(line.productName);
  const itemName = partNumber
    ? normalizePrintText(rawName.replace(new RegExp(`\\b${partNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), ""))
    : rawName;

  let brand = normalizePrintText(line.brandName);
  if (!brand && partNumber) {
    const skuTail = normalizePrintText(String(line.currentSku ?? line.sku ?? "").replace(partNumber, ""));
    brand = skuTail && !looksLikeInternalSku(skuTail) ? skuTail.toUpperCase() : "";
  }

  return {
    itemName: itemName || rawName,
    brand,
    partNumber,
  };
}

function printReturnForm(rtv: any, mode: "supplier" | "internal" = "supplier") {
  const date = new Date(rtv.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const supplierName = rtv.supplierName || rtv.supplier?.name || "";
  const locationName = rtv.locationName || rtv.location?.name || "";
  const preparedBy = rtv.createdByName || "____________________";
  const stockDeductedAt = rtv.submittedAt
    ? new Date(rtv.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not yet deducted";
  const totalItems = rtv.lines.length;
  const totalUnits = rtv.lines.reduce((s: number, l: any) => s + l.quantity, 0);
  const totalCost = pesoText(rtv.totalCost);
  const reasonLabel = REASON_LABELS[rtv.reason] ?? String(rtv.reason || "").replace(/_/g, " ");
  const modeTitle = mode === "internal" ? "Internal copy" : "Supplier copy";
  const auditRows = mode === "internal"
    ? (rtv.statusHistory || [])
        .map((entry: any) => `<tr>
          <td>${escapeHtml(entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-US") : "")}</td>
          <td>${escapeHtml(supplierReturnStatusLabel(entry.toStatus, rtv.cancelReason))}</td>
          <td>${escapeHtml(entry.changedByName || "")}</td>
          <td>${escapeHtml(entry.notes || "")}</td>
        </tr>`)
        .join("\n")
    : "";

  const itemRows = rtv.lines
    .map((line: any) => {
      const printLine = deriveReturnPrintLine(line);
      const unitCost = supplierReturnLineUnitCost(line);
      const lineTotal = line.lineTotal || String(unitCost * line.quantity);

      return `<tr>
        <td class="qty">${line.quantity}</td>
        <td class="item">${escapeHtml(printLine.itemName)}</td>
        <td class="brand">${escapeHtml(printLine.brand)}</td>
        <td class="part">${escapeHtml(printLine.partNumber)}</td>
        <td class="money">${pesoText(unitCost)}</td>
        <td class="money">${pesoText(lineTotal)}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html><head><title>Return Form - ${escapeHtml(rtv.rtvNo)}</title>
<style>
  @media print { @page { size: landscape; margin: 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0 auto; padding: 10px; max-width: 1180px; }
  h1 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 34px; line-height: 1.08; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; }
  .date { margin-top: 6px; font-family: Georgia, 'Times New Roman', serif; font-size: 34px; line-height: 1.08; font-weight: 800; }
  .meta-line { margin: 10px 0 8px; color: #333; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 2px 8px; border-top: 1px solid #d9d9d9; border-bottom: 1px solid #d9d9d9; border-right: 1px solid #e5e5e5; font-size: 20px; font-weight: 400; text-align: left; white-space: nowrap; }
  td { padding: 2px 8px; border-bottom: 1px solid #eeeeee; border-right: 1px solid #eeeeee; font-size: 20px; vertical-align: top; }
  .qty { width: 70px; text-align: right; }
  .item { width: 370px; letter-spacing: 1px; }
  .brand { width: 170px; letter-spacing: 1px; }
  .part { width: 260px; letter-spacing: 1px; }
  .money { width: 160px; text-align: right; letter-spacing: 2px; white-space: nowrap; }
  .spacer td { height: 46px; border-bottom: 1px solid #d9d9d9; }
  .total-rule { border-top: 1px solid #333; }
  .grand-total { font-size: 32px; text-align: right; letter-spacing: 3px; padding-top: 8px; }
  .footer { margin-top: 28px; color: #555; font-size: 12px; display: flex; justify-content: space-between; gap: 24px; }
  .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 50px; }
  .signature-block { border-top: 1px solid #333; padding-top: 6px; color: #555; font-size: 12px; }
  .copy-label { margin-top: 4px; color: #555; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .audit { margin-top: 22px; font-size: 12px; }
  .audit th, .audit td { font-size: 12px; letter-spacing: 0; }
</style></head><body onload="window.print()">
  <h1>RETURN ITEMS: ${escapeHtml(supplierName || "Supplier")} #${escapeHtml(rtv.rtvNo)}</h1>
  <div class="copy-label">${escapeHtml(modeTitle)}</div>
  <div class="date">${date}</div>
  <div class="meta-line">
    Reason: ${escapeHtml(reasonLabel)}
    ${mode === "internal" ? ` | Location: ${escapeHtml(locationName || "Not specified")} | Stock deducted: ${escapeHtml(stockDeductedAt)} | Prepared by: ${escapeHtml(preparedBy)}` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th class="qty">QTY</th>
        <th>ITEM</th>
        <th>BRAND</th>
        <th>PART #</th>
        <th class="money">UNIT PRICE</th>
        <th class="money">AMOUNT</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="spacer"><td colspan="4"></td><td></td><td class="total-rule"></td></tr>
      <tr>
        <td colspan="5"></td>
        <td class="grand-total">${totalCost}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div>${totalItems} item${totalItems !== 1 ? "s" : ""}, ${totalUnits} unit${totalUnits !== 1 ? "s" : ""}${mode === "internal" ? ` | Prepared by: ${escapeHtml(preparedBy)}` : ""}</div>
    <div>Credit Memo / Deduction Reference: ____________________ &nbsp; Amount: ____________________</div>
  </div>
  ${mode === "internal" && auditRows ? `
    <table class="audit">
      <thead><tr><th>Date/Time</th><th>Status</th><th>User</th><th>Notes</th></tr></thead>
      <tbody>${auditRows}</tbody>
    </table>
  ` : ""}
  <div class="signature-grid">
    <div class="signature-block">Prepared by / Date</div>
    <div class="signature-block">Dispatched by / Date</div>
    <div class="signature-block">Supplier received by / Date</div>
  </div>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Page ──

export default function SupplierReturnDetailPage() {
  const params = useParams<{ rtvId: string }>();
  const rtvId = params?.rtvId as string;
  const router = useRouter();
  const { token, locationId, loading: authLoading } = useAuth();
  const confirm = useConfirm();

  const { data: rtv, isLoading, error, refetch } = useSupplierReturnDetail(token, locationId, rtvId);
  const attachmentsQuery = useSupplierReturnAttachments(token, locationId, rtvId);
  const addAttachmentMutation = useAddSupplierReturnAttachment(token, locationId);
  const deleteAttachmentMutation = useDeleteSupplierReturnAttachment(token, locationId);
  const actionMutation = useSupplierReturnAction(token, locationId);
  const deleteMutation = useDeleteSupplierReturn(token, locationId);
  const attachments = attachmentsQuery.data?.data ?? [];

  // ── Modal states ──
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<{
    title: string;
    message: string;
    action: string;
    requiresInput?: boolean;
    inputLabel?: string;
  } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  // ── Credit modal state ──
  const [creditAmount, setCreditAmount] = useState("");
  const [creditType, setCreditType] = useState("CREDIT_MEMO");
  const [creditReference, setCreditReference] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [attachmentType, setAttachmentType] = useState("DEFECT_PHOTO");

  const creditVariance = useMemo(() => {
    if (!rtv) return 0;
    const total = parseFloat(rtv.totalCost);
    const credit = parseFloat(creditAmount) || 0;
    return credit - total;
  }, [rtv, creditAmount]);

  const stockImpactRows = useMemo(() => {
    if (!rtv) return [];
    return rtv.lines.map((line) => {
      const currentStock = numericStockLevel(line.currentStockLevel);
      const afterSubmit = currentStock - line.quantity;
      return {
        id: line.id,
        productName: line.productName,
        currentStock,
        returnQty: line.quantity,
        afterSubmit,
      };
    });
  }, [rtv]);

  const hasNegativeStockImpact = stockImpactRows.some((row) => row.afterSubmit < 0);

  // ── Action handlers ──

  function handleAction(action: string, body?: Record<string, unknown>) {
    actionMutation.mutate(
      { rtvId, action: action as any, body },
      {
        onSuccess: () => {
          setShowConfirmDialog(null);
          setConfirmInput("");
          refetch();
        },
      },
    );
  }

  function handleRecordCredit() {
    handleAction("receive-credit", {
      creditAmount: creditAmount,
      creditType,
      creditReference: creditReference || undefined,
      notes: creditNotes || undefined,
    });
    setShowCreditModal(false);
    setCreditAmount("");
    setCreditType("CREDIT_MEMO");
    setCreditReference("");
    setCreditNotes("");
  }

  function handleAttachmentUpload(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      addAttachmentMutation.mutate({
        rtvId,
        body: {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          attachmentType,
          dataUrl: String(reader.result || ""),
        },
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleDeleteDraft() {
    const ok = await confirm({
      title: "Delete draft RTV?",
      message: "This deletes the draft supplier return. Stock has not been deducted yet, but the draft record will be removed.",
      confirmLabel: "Delete Draft",
      variant: "danger",
    });
    if (!ok) return;
    deleteMutation.mutate(rtvId, {
      onSuccess: () => router.push("/procurement/supplier-returns"),
    });
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading RTV...</div>
      </div>
    );
  }

  if (error || !rtv) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-destructive">{(error as Error)?.message || "RTV not found"}</p>
        <Link href="/procurement/supplier-returns" className="text-sm text-primary hover:underline">
          Back to Supplier Returns
        </Link>
      </div>
    );
  }

  const totalCost = parseFloat(rtv.totalCost);

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Breadcrumb + Header */}
      <div>
        <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/procurement/supplier-returns" className="hover:text-foreground hover:underline">
            Supplier Returns
          </Link>
          <span>/</span>
          <span className="text-foreground">{rtv.rtvNo}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{rtv.rtvNo}</h2>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                  STATUS_COLORS[rtv.status] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {supplierReturnStatusLabel(rtv.status, (rtv as any).cancelReason)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rtv.supplierName || (rtv as any).supplier?.name || "Supplier not specified"} &middot; {REASON_LABELS[rtv.reason] ?? rtv.reason}
            </p>
          </div>

          {/* Contextual Action Buttons */}
          <div className="flex items-center gap-2">
            {rtv.status !== "CANCELLED" && (
              <>
                <button
                  onClick={() => printReturnForm(rtv, "supplier")}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Print Supplier Copy
                </button>
                <button
                  onClick={() => printReturnForm(rtv, "internal")}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Print Internal Copy
                </button>
              </>
            )}
            {rtv.status === "DRAFT" && (
              <>
                <button
                  onClick={() =>
                    setShowConfirmDialog({
                      title: "Submit & Deduct Stock",
                      message: "This will deduct the return quantities from the selected location and dispatch the RTV to the supplier.",
                      action: "submit",
                    })
                  }
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Submit & Deduct Stock
                </button>
                <Link
                  href={`/procurement/supplier-returns/new?edit=${rtv.id}`}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Edit
                </Link>
                <button
                  onClick={handleDeleteDraft}
                  disabled={deleteMutation.isPending}
                  className="rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
            {rtv.status === "SUBMITTED" && (
              <>
                <button
                  onClick={() => handleAction("acknowledge")}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Mark Acknowledged
                </button>
                <button
                  onClick={() =>
                    setShowConfirmDialog({
                      title: "Cancel RTV",
                      message: "Provide a reason for cancellation:",
                      action: "cancel",
                      requiresInput: true,
                      inputLabel: "Reason",
                    })
                  }
                  className="rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5"
                >
                  Cancel
                </button>
              </>
            )}
            {rtv.status === "ACKNOWLEDGED" && (
              <>
                <button
                  onClick={() => {
                    setCreditAmount(rtv.totalCost);
                    setShowCreditModal(true);
                  }}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Record Credit
                </button>
                <button
                  onClick={() =>
                    setShowConfirmDialog({
                      title: "Close Without Credit",
                      message: "Close this RTV without recording any credit?",
                      action: "close-without-credit",
                      requiresInput: true,
                      inputLabel: "Reason",
                    })
                  }
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Close Without Credit
                </button>
                <button
                  onClick={() =>
                    setShowConfirmDialog({
                      title: "Supplier Rejected - Return Items to Stock",
                      message: "Use this only when the supplier rejected the return and the items physically came back. This will restore the RTV quantities to stock.",
                      action: "reject",
                      requiresInput: true,
                      inputLabel: "Rejection reason",
                    })
                  }
                  className="rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5"
                >
                  Supplier Rejected
                </button>
              </>
            )}
            {rtv.status === "CREDIT_RECEIVED" && (
              <button
                onClick={() => handleAction("close")}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mutation error */}
      {(actionMutation.isError || deleteMutation.isError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {(actionMutation.error as Error)?.message || (deleteMutation.error as Error)?.message || "Action failed"}
        </div>
      )}

      {/* Overview Section */}
      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-2">
          <h3 className="text-sm font-semibold">Overview</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Return From</p>
            <p className="mt-0.5 text-sm">{rtv.locationName || (rtv as any).location?.name || "Location not specified"}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Reason</p>
            <p className="mt-0.5 text-sm">{REASON_LABELS[rtv.reason] ?? rtv.reason}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Source PO</p>
            <p className="mt-0.5 text-sm">
              {rtv.sourcePONo ? (
                <Link
                  href={`/procurement/purchase-orders/${rtv.sourcePONo}`}
                  className="text-primary hover:underline"
                >
                  {rtv.sourcePONo}
                </Link>
              ) : (
                "\u2014"
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Created</p>
            <p className="mt-0.5 text-sm">{fmtDate(rtv.createdAt)}</p>
          </div>
          {rtv.notes && (
            <div className="col-span-full">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{rtv.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-2">
          <h3 className="text-sm font-semibold">Line Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</th>
                <th scope="col" className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                <th scope="col" className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Condition</th>
                <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost/Unit</th>
                <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Line Total</th>
                <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rtv.lines.map((line, i) => (
                <tr
                  key={line.id}
                  className={`border-b border-border ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                >
                  <td className="px-3 py-2 text-sm font-medium">{line.productName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{line.sku}</td>
                  <td className="px-3 py-2 text-center text-sm">{line.quantity}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        CONDITION_COLORS[line.condition] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {line.condition}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm">{fmtPeso((line as any).costPrice ?? line.costPerUnit)}</td>
                  <td className="px-3 py-2 text-right text-sm font-medium">{fmtPeso(line.lineTotal)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{line.notes || "\u2014"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold">Total</td>
                <td className="px-3 py-2 text-right text-sm font-bold">{fmtPeso(rtv.totalCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Credit Info (visible when CREDIT_RECEIVED or CLOSED) */}
      {(rtv.status === "CREDIT_RECEIVED" || rtv.status === "CLOSED") && rtv.creditAmount && (
        <div className="rounded-lg border border-green-200 bg-green-50">
          <div className="border-b border-green-200 px-4 py-2">
            <h3 className="text-sm font-semibold text-green-800">Credit Information</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-green-700">Credit Amount</p>
              <p className="mt-0.5 text-sm font-semibold">{fmtPeso(rtv.creditAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-green-700">Credit Type</p>
              <p className="mt-0.5 text-sm">{rtv.creditType?.replace(/_/g, " ") ?? "\u2014"}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-green-700">Reference</p>
              <p className="mt-0.5 text-sm">{rtv.creditReference || "\u2014"}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-green-700">Variance</p>
              {(() => {
                const variance = parseFloat(rtv.creditAmount) - totalCost;
                const isNeg = variance < 0;
                return (
                  <p className={`mt-0.5 text-sm font-medium ${isNeg ? "text-red-600" : variance > 0 ? "text-green-600" : ""}`}>
                    {isNeg ? "-" : "+"}{fmtPeso(Math.abs(variance))}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Proof Attachments */}
      <div className="rounded-lg border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div>
            <h3 className="text-sm font-semibold">Proof Attachments</h3>
            <p className="text-xs text-muted-foreground">
              Product photos, defect proof, signed return forms, and credit memo files.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={attachmentType}
              onChange={(e) => setAttachmentType(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="DEFECT_PHOTO">Defect photo</option>
              <option value="PRODUCT_PHOTO">Product photo</option>
              <option value="SIGNED_RETURN_FORM">Signed return form</option>
              <option value="CREDIT_MEMO">Credit memo</option>
              <option value="OTHER">Other</option>
            </select>
            <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent">
              {addAttachmentMutation.isPending ? "Uploading..." : "Attach file"}
              <input
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={(e) => {
                  handleAttachmentUpload(e.target.files?.[0] ?? null);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <div className="p-4">
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No proof files attached yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{attachment.fileName}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {attachment.attachmentType.replace(/_/g, " ")} · {Math.ceil((attachment.sizeBytes || 0) / 1024)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        deleteAttachmentMutation.mutate({ rtvId, attachmentId: attachment.id })
                      }
                      className="text-[11px] font-semibold text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                  <a
                    href={attachment.dataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                  >
                    Open proof
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {rtv.statusHistory.length > 0 && (
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-2">
            <h3 className="text-sm font-semibold">Status Timeline</h3>
          </div>
          <div className="p-4">
            <div className="relative ml-3">
              {/* Vertical line */}
              <div className="absolute left-[5px] top-2 bottom-2 w-[2px] bg-border" />
              <div className="flex flex-col gap-4">
                {rtv.statusHistory.map((entry) => (
                  <TimelineEntry key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog ── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-base font-semibold">{showConfirmDialog.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{showConfirmDialog.message}</p>
            {showConfirmDialog.action === "submit" && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                      Stock impact preview
                    </p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      These quantities will be deducted immediately when you confirm.
                    </p>
                  </div>
                  {hasNegativeStockImpact && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      Negative stock warning
                    </span>
                  )}
                </div>
                <div className="max-h-52 overflow-auto rounded-md border border-amber-200 bg-white/70">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-amber-200 bg-amber-100/60 text-amber-900">
                        <th className="px-2 py-1 text-left font-semibold">Item</th>
                        <th className="px-2 py-1 text-right font-semibold">Current</th>
                        <th className="px-2 py-1 text-right font-semibold">Return</th>
                        <th className="px-2 py-1 text-right font-semibold">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockImpactRows.map((row) => (
                        <tr key={row.id} className="border-b border-amber-100 last:border-0">
                          <td className="px-2 py-1 font-medium text-gray-900">{row.productName}</td>
                          <td className="px-2 py-1 text-right text-gray-700">{row.currentStock}</td>
                          <td className="px-2 py-1 text-right text-gray-700">-{row.returnQty}</td>
                          <td className={`px-2 py-1 text-right font-semibold ${row.afterSubmit < 0 ? "text-red-700" : "text-gray-900"}`}>
                            {row.afterSubmit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-amber-800">
                  If this does not match the physical items leaving the store, cancel and edit the RTV first.
                </p>
              </div>
            )}
            {showConfirmDialog.requiresInput && (
              <div className="mt-3">
                <label className="text-xs font-medium text-muted-foreground">
                  {showConfirmDialog.inputLabel || "Notes"}
                </label>
                <textarea
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  rows={2}
                />
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowConfirmDialog(null);
                  setConfirmInput("");
                }}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const body: Record<string, unknown> = {};
                  if (showConfirmDialog.requiresInput && confirmInput) {
                    body.notes = confirmInput;
                    body.reason = confirmInput;
                  }
                  handleAction(showConfirmDialog.action, Object.keys(body).length > 0 ? body : undefined);
                }}
                disabled={actionMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {actionMutation.isPending
                  ? "Processing..."
                  : showConfirmDialog.action === "submit"
                    ? "Submit & Deduct Stock"
                    : showConfirmDialog.action === "reject"
                      ? "Restore Stock"
                      : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Credit Modal ── */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Record Supplier Credit</h3>
              <button
                onClick={() => setShowCreditModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Credit Amount <span className="text-destructive">*</span>
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    &#8369;
                  </span>
                  <input
                    type="number"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    step="0.01"
                    min="0"
                    className="w-full rounded-md border border-border bg-background pl-7 pr-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Credit Type <span className="text-destructive">*</span>
                </label>
                <select
                  value={creditType}
                  onChange={(e) => setCreditType(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="CREDIT_MEMO">Credit Memo</option>
                  <option value="CASH_REFUND">Cash Refund</option>
                  <option value="REPLACEMENT">Replacement</option>
                  <option value="DEDUCTED_FROM_NEXT_PO">Deducted from Next PO</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Reference</label>
                <input
                  type="text"
                  value={creditReference}
                  onChange={(e) => setCreditReference(e.target.value)}
                  placeholder="e.g. CM-2026-0451"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  rows={2}
                />
              </div>

              {/* Cost / Credit / Variance summary */}
              <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Cost:</span>
                  <span className="font-medium">{fmtPeso(totalCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit:</span>
                  <span className="font-medium">{fmtPeso(parseFloat(creditAmount) || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="text-muted-foreground">Variance:</span>
                  <span
                    className={`font-medium ${
                      creditVariance < 0 ? "text-red-600" : creditVariance > 0 ? "text-green-600" : ""
                    }`}
                  >
                    {creditVariance < 0 ? "-" : "+"}
                    {fmtPeso(Math.abs(creditVariance))}
                    {creditVariance < 0 && " (handling)"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreditModal(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordCredit}
                disabled={!creditAmount || parseFloat(creditAmount) <= 0 || actionMutation.isPending}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {actionMutation.isPending ? "Processing..." : "Record Credit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline Entry ──

function TimelineEntry({ entry }: { entry: StatusHistoryEntry }) {
  const dotColor = TIMELINE_DOT_COLORS[entry.toStatus] ?? "bg-gray-400";

  return (
    <div className="relative flex gap-3 pl-1">
      {/* Dot */}
      <div className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dotColor} ring-2 ring-background`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">
            {supplierReturnStatusLabel(entry.toStatus, entry.notes)}
          </span>
          {entry.createdAt && (
            <span className="text-xs text-muted-foreground">
              {fmtDateTime(entry.createdAt)}
            </span>
          )}
        </div>
        {(entry.changedByName || entry.notes) && (
          <p className="text-xs text-muted-foreground">
            {entry.changedByName && <>by {entry.changedByName}</>}
            {entry.notes && <span>{entry.changedByName ? " \u2014 " : ""}{entry.notes}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
