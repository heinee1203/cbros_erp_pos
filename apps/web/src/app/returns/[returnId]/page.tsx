"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, fmtPeso } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { useReturnDetail, useCompleteReturn, useVoidReturn } from "@/hooks/use-returns";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  COMPLETED: "bg-success/10 text-success",
  VOIDED: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  COMPLETED: "Completed",
  VOIDED: "Voided",
};

const CONDITION_COLORS: Record<string, string> = {
  RESELLABLE: "bg-success/10 text-success",
  DAMAGED: "bg-warning/10 text-warning",
  DEFECTIVE: "bg-destructive/10 text-destructive",
};

const REASON_LABELS: Record<string, string> = {
  WRONG_FITMENT: "Wrong Fitment",
  DEFECTIVE: "Defective",
  CUSTOMER_CHANGED_MIND: "Customer Changed Mind",
  WARRANTY: "Warranty",
  DUPLICATE_PURCHASE: "Duplicate Purchase",
  OTHER: "Other",
};

const REFUND_LABELS: Record<string, string> = {
  CASH: "Cash",
  ORIGINAL_METHOD: "Original Method",
  STORE_CREDIT: "Store Credit",
  ACCOUNT_CREDIT: "Account Credit",
};

export default function ReturnDetailPage() {
  const params = useParams<{ returnId: string }>();
  const router = useRouter();
  const returnId = params?.returnId as string;
  const { token, locationId, user } = useAuth();

  const detailQuery = useReturnDetail(token, locationId, returnId);
  const completeMutation = useCompleteReturn(token, locationId);
  const voidMutation = useVoidReturn(token, locationId);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");

  const ret = detailQuery.data as any;

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-4">
          <Link href="/returns" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft size={12} /> Back to Returns
          </Link>
          <h2 className="text-lg font-semibold">Return Detail</h2>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!ret) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground">Return not found</p>
        <Link href="/returns" className="mt-2 text-sm text-primary hover:underline">
          Back to Returns
        </Link>
      </div>
    );
  }

  const lines = ret.lines ?? [];
  const sale = ret.sale;
  const customer = ret.customer;
  const location = ret.location;

  const handleComplete = async () => {
    setPinError("");
    if (pin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }
    try {
      await completeMutation.mutateAsync({ returnId, approvalPin: pin });
      setShowPinModal(false);
      setPin("");
    } catch (err: any) {
      setPinError(err.message || "Failed to complete return");
    }
  };

  const handleVoid = async () => {
    setVoidError("");
    if (!voidReason.trim()) {
      setVoidError("A reason is required");
      return;
    }
    try {
      await voidMutation.mutateAsync({ returnId, reason: voidReason.trim() });
      setShowVoidModal(false);
      setVoidReason("");
    } catch (err: any) {
      setVoidError(err.message || "Failed to void return");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4">
        <Link href="/returns" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Back to Returns
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{ret.returnNumber}</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                STATUS_COLORS[ret.status] ?? "bg-muted text-muted-foreground"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {STATUS_LABELS[ret.status] ?? ret.status}
            </span>
          </div>
          <div className="flex gap-2">
            {ret.status === "DRAFT" && (
              <button
                onClick={() => setShowPinModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <CheckCircle size={14} /> Complete Return
              </button>
            )}
            {ret.status === "COMPLETED" && user?.role === "ADMIN" && (
              <button
                onClick={() => setShowVoidModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                <XCircle size={14} /> Void Return
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Created {fmtDateTime(ret.createdAt)}
          {location && <> at {location.name}</>}
        </p>
      </div>

      {/* Original Sale */}
      <div className="mb-4 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Original Sale
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <span className="text-xs text-muted-foreground">Sale #</span>
            <div className="font-mono font-semibold">
              {sale ? (
                <Link href={`/sales/receipts`} className="text-primary hover:underline">
                  {sale.saleNo}
                </Link>
              ) : (
                "\u2014"
              )}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Customer</span>
            <div className="font-medium">{customer?.name ?? "\u2014"}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Return Reason</span>
            <div className="font-medium">{REASON_LABELS[ret.returnReason] ?? ret.returnReason}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Reason Notes</span>
            <div className="font-medium">{ret.reasonNotes ?? "\u2014"}</div>
          </div>
        </div>
      </div>

      {/* Returned Items */}
      <div className="mb-4 overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Returned Items
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Item
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                SKU
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Qty
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Unit Price
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Line Total
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Condition
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Restocked
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line: any, i: number) => (
              <tr
                key={line.id}
                className={cn(
                  "border-b border-border",
                  i % 2 === 0 ? "bg-background" : "bg-muted/20"
                )}
              >
                <td className="px-3 py-2 font-medium">{line.productName}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{line.sku}</td>
                <td className="px-3 py-2 text-right">{line.quantity}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {fmtPeso(line.unitPrice)}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {fmtPeso(line.lineTotal)}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      CONDITION_COLORS[line.condition] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {line.condition}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {line.restock && line.condition === "RESELLABLE" ? (
                    <span className="text-success font-medium">Yes</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Refund Summary */}
      <div className="mb-4 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Refund Summary
        </h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{fmtPeso(ret.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span>{fmtPeso(ret.taxAmount ?? "0")}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
            <span>Total Refund</span>
            <span>{fmtPeso(ret.total)}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-muted-foreground">Refund Method</span>
            <span className="font-medium">{REFUND_LABELS[ret.refundMethod] ?? ret.refundMethod}</span>
          </div>
          {ret.refundReference && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono text-xs">{ret.refundReference}</span>
            </div>
          )}
        </div>
      </div>

      {/* Audit Trail */}
      <div className="mb-4 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Audit Trail
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-3">
          <div>
            <span className="text-xs text-muted-foreground">Created</span>
            <div>{fmtDateTime(ret.createdAt)}</div>
          </div>
          {ret.processedBy && (
            <div>
              <span className="text-xs text-muted-foreground">Processed By</span>
              <div>{ret.processedByName ?? ret.processedBy}</div>
            </div>
          )}
          {ret.approvedBy && (
            <div>
              <span className="text-xs text-muted-foreground">Approved By</span>
              <div>{ret.approvedByName ?? ret.approvedBy}</div>
            </div>
          )}
          {ret.completedAt && (
            <div>
              <span className="text-xs text-muted-foreground">Completed</span>
              <div>{fmtDateTime(ret.completedAt)}</div>
            </div>
          )}
          {ret.voidedAt && (
            <div>
              <span className="text-xs text-muted-foreground">Voided</span>
              <div>{fmtDateTime(ret.voidedAt)}</div>
            </div>
          )}
          {ret.voidReason && (
            <div>
              <span className="text-xs text-muted-foreground">Void Reason</span>
              <div>{ret.voidReason}</div>
            </div>
          )}
          {ret.notes && (
            <div className="md:col-span-3">
              <span className="text-xs text-muted-foreground">Notes</span>
              <div>{ret.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold">Complete Return</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Enter manager PIN to authorize this return of {fmtPeso(ret.total)}
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setPinError("");
              }}
              placeholder="Enter PIN"
              className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleComplete();
              }}
            />
            {pinError && (
              <p className="mb-2 text-xs text-destructive">{pinError}</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setPin("");
                  setPinError("");
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={completeMutation.isPending}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {completeMutation.isPending ? (
                  <Loader2 size={14} className="inline animate-spin mr-1" />
                ) : null}
                Authorize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-destructive">Void Return</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              This will reverse all stock changes and refunds for {ret.returnNumber}.
              This action cannot be undone.
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => {
                setVoidReason(e.target.value);
                setVoidError("");
              }}
              placeholder="Reason for voiding this return..."
              rows={3}
              className="mb-2 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              autoFocus
            />
            {voidError && (
              <p className="mb-2 text-xs text-destructive">{voidError}</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowVoidModal(false);
                  setVoidReason("");
                  setVoidError("");
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={voidMutation.isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {voidMutation.isPending ? (
                  <Loader2 size={14} className="inline animate-spin mr-1" />
                ) : null}
                Void Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
