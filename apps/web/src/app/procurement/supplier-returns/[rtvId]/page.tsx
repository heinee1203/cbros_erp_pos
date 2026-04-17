"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import {
  useSupplierReturnDetail,
  useSupplierReturnAction,
  useDeleteSupplierReturn,
  type StatusHistoryEntry,
} from "@/hooks/use-supplier-returns";
import { fmtPeso, fmtDate, fmtDateTime } from "@/lib/format";

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
  SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged",
  CREDIT_RECEIVED: "Credit Received",
  CLOSED: "Closed",
  CLOSED_WITHOUT_CREDIT: "Closed (No Credit)",
  CANCELLED: "Cancelled",
};

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

function printReturnForm(rtv: any) {
  const date = new Date(rtv.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const totalItems = rtv.lines.length;
  const totalUnits = rtv.lines.reduce((s: number, l: any) => s + l.quantity, 0);
  const totalCost = parseFloat(rtv.totalCost).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itemRows = rtv.lines
    .map((l: any, i: number) =>
      `<tr>
        <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #e5e5e5;">${i + 1}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;">${l.productName}</td>
        <td style="padding:4px 8px;font-family:monospace;font-size:11px;border-bottom:1px solid #e5e5e5;">${l.sku || "—"}</td>
        <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #e5e5e5;">${l.quantity}</td>
        <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #e5e5e5;">
          <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${l.condition === "DEFECTIVE" ? "#fee2e2" : l.condition === "DAMAGED" ? "#ffedd5" : "#f3f4f6"};color:${l.condition === "DEFECTIVE" ? "#b91c1c" : l.condition === "DAMAGED" ? "#c2410c" : "#374151"};">${l.condition}</span>
        </td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #e5e5e5;">₱${parseFloat(l.costPrice || l.costPerUnit || "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
        <td style="padding:4px 8px;font-size:11px;border-bottom:1px solid #e5e5e5;">${l.notes || ""}</td>
      </tr>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html><head><title>Return Form — ${rtv.rtvNo}</title>
<style>
  @media print { @page { margin: 15mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; padding: 12px 0; border: 2px solid #1a1a1a; margin-bottom: 16px; }
  .header h1 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: 1px; }
  .header p { margin: 2px 0 0; font-size: 11px; color: #666; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .meta-label { font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-value { font-size: 13px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #666; background: #f9fafb; border-bottom: 2px solid #e5e5e5; }
  .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 30px; }
  .sig-block { border-top: 1px solid #ccc; padding-top: 8px; }
  .sig-label { font-size: 11px; color: #666; }
</style></head><body onload="window.print()">
  <div class="header">
    <h1>SUPPLIER RETURN FORM</h1>
    <p>For Account Deduction</p>
  </div>

  <div class="meta">
    <div><div class="meta-label">RTV No</div><div class="meta-value">${rtv.rtvNo}</div></div>
    <div><div class="meta-label">Date</div><div class="meta-value">${date}</div></div>
    <div><div class="meta-label">From</div><div class="meta-value">C-BROS Genuine Autoparts &amp; Accessories, Inc. — ${rtv.location?.name ?? ""}</div></div>
    <div><div class="meta-label">To (Supplier)</div><div class="meta-value">${rtv.supplier?.name ?? ""}</div></div>
    <div><div class="meta-label">Reason</div><div class="meta-value">${REASON_LABELS[rtv.reason] ?? rtv.reason}</div></div>
    ${rtv.notes ? `<div><div class="meta-label">Notes</div><div class="meta-value">${rtv.notes}</div></div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:center;width:30px;">#</th>
        <th>Item</th>
        <th>SKU</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:center;">Condition</th>
        <th style="text-align:right;">Cost/Unit</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr style="background:#f9fafb;">
        <td colspan="3" style="padding:6px 8px;text-align:right;font-weight:700;">Total</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;">${totalUnits}</td>
        <td></td>
        <td style="padding:6px 8px;text-align:right;font-weight:700;">₱${totalCost}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top:16px;font-size:11px;color:#666;">
    ${totalItems} item${totalItems !== 1 ? "s" : ""}, ${totalUnits} unit${totalUnits !== 1 ? "s" : ""} &middot; Total cost value: ₱${totalCost}
  </div>

  <div class="sig-section">
    <div>
      <div style="height:40px;"></div>
      <div class="sig-block">
        <div class="sig-label">Returned by (CBROS Genuine Autoparts & Accessories, Inc.)</div>
        <div style="margin-top:4px;font-size:11px;color:#aaa;">Name / Signature / Date</div>
      </div>
    </div>
    <div>
      <div style="height:40px;"></div>
      <div class="sig-block">
        <div class="sig-label">Received by (Supplier Representative)</div>
        <div style="margin-top:4px;font-size:11px;color:#aaa;">Name / Signature / Date</div>
      </div>
    </div>
  </div>

  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5;">
    <div style="font-size:11px;color:#666;">
      Credit Memo / Deduction Reference: ____________________________
      <span style="margin-left:24px;">Amount: ₱__________________</span>
    </div>
  </div>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Page ──

export default function SupplierReturnDetailPage() {
  const params = useParams<{ rtvId: string }>();
  const rtvId = params.rtvId;
  const router = useRouter();
  const { token, locationId, loading: authLoading } = useAuth();

  const { data: rtv, isLoading, error, refetch } = useSupplierReturnDetail(token, locationId, rtvId);
  const actionMutation = useSupplierReturnAction(token, locationId);
  const deleteMutation = useDeleteSupplierReturn(token, locationId);

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

  const creditVariance = useMemo(() => {
    if (!rtv) return 0;
    const total = parseFloat(rtv.totalCost);
    const credit = parseFloat(creditAmount) || 0;
    return credit - total;
  }, [rtv, creditAmount]);

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
                {STATUS_LABELS[rtv.status] ?? rtv.status}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rtv.supplierName} &middot; {REASON_LABELS[rtv.reason] ?? rtv.reason}
            </p>
          </div>

          {/* Contextual Action Buttons */}
          <div className="flex items-center gap-2">
            {rtv.status !== "CANCELLED" && (
              <button
                onClick={() => printReturnForm(rtv)}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                Print Return Form
              </button>
            )}
            {rtv.status === "DRAFT" && (
              <>
                <button
                  onClick={() =>
                    setShowConfirmDialog({
                      title: "Submit to Supplier",
                      message: "This will deduct inventory and submit the RTV. Continue?",
                      action: "submit",
                    })
                  }
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Submit to Supplier
                </button>
                <Link
                  href={`/procurement/supplier-returns/new?edit=${rtv.id}`}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Edit
                </Link>
                <button
                  onClick={() => {
                    if (!confirm("Are you sure you want to delete this draft RTV?")) return;
                    deleteMutation.mutate(rtvId, {
                      onSuccess: () => router.push("/procurement/supplier-returns"),
                    });
                  }}
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
            <p className="mt-0.5 text-sm">{rtv.locationName}</p>
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
                  <td className="px-3 py-2 text-right text-sm">{fmtPeso(line.costPerUnit)}</td>
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
                {actionMutation.isPending ? "Processing..." : "Confirm"}
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
                  <option value="REFUND">Refund</option>
                  <option value="REPLACEMENT">Replacement</option>
                  <option value="DEBIT_NOTE">Debit Note</option>
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
            {STATUS_LABELS[entry.toStatus] ?? entry.toStatus.replace(/_/g, " ")}
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
