"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useTransferQuery, type TransferDetail, type TransferItem } from "@/hooks/use-transfer-query";
import {
  useApproveMutation,
  useStartPickingMutation,
  useDispatchMutation,
  useReceiveMutation,
  useVarianceMutation,
  useCancelMutation,
  type TransferMutationStatus,
  type ReceiveLineInput,
  type DispatchLineInput,
  type VarianceLineInput,
} from "@/hooks/use-transfer-mutations";
import { useAuth } from "@/app/auth-context";

// ── Status colors ──
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  APPROVED: "bg-primary/10 text-primary",
  PICKING: "bg-warning/10 text-warning",
  DISPATCHED: "bg-warning/10 text-warning",
  PARTIALLY_RECEIVED: "bg-warning/10 text-warning",
  DISCREPANCY_REVIEW: "bg-destructive/10 text-destructive",
  RECEIVED: "bg-success/10 text-success",
  CLOSED_WITH_VARIANCE: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  PICKING: "Picking",
  DISPATCHED: "Dispatched",
  PARTIALLY_RECEIVED: "Partially Received",
  DISCREPANCY_REVIEW: "Discrepancy Review",
  RECEIVED: "Received",
  CLOSED_WITH_VARIANCE: "Closed (Variance)",
  CANCELLED: "Cancelled",
};

/* ══════════════════════════════════════════════════════════
 * Transfer Detail Page — /transfers/[transferNo]
 *
 * Server-driven actions: buttons rendered strictly from
 * backend allowedActions[]. No client inference.
 * ══════════════════════════════════════════════════════════ */
export default function TransferDetailPage() {
  const { token, locationId } = useAuth();
  const params = useParams<{ transferNo: string }>();
  const transferNo = params.transferNo;

  const { data: transfer, isLoading, error, refetch } = useTransferQuery(
    transferNo,
    token,
    locationId,
  );

  // ── Active modal state ──
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Close modals on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeModal) {
        setActiveModal(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeModal]);

  /**
   * Before opening any action modal, refetch transfer data
   * to guarantee we're not acting on stale quantities.
   */
  const openModal = useCallback(
    async (action: string) => {
      await refetch();
      setActiveModal(action);
    },
    [refetch],
  );

  const closeModal = useCallback(() => setActiveModal(null), []);

  // ── Loading / Error states ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading transfer {transferNo}...</div>
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-sm font-medium text-destructive">Transfer not found</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Transfer {transferNo} does not exist or you do not have access.
        </p>
        <a href="/" className="mt-4 text-xs text-primary hover:underline">
          Back to Inventory
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/" className="text-xs text-muted-foreground hover:text-primary">
            &larr; Back to Inventory
          </a>
          <h2 className="mt-1 text-lg font-bold tracking-tight">
            Transfer {transfer.transferNo}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                STATUS_STYLES[transfer.status] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {STATUS_LABELS[transfer.status] ?? transfer.status}
            </span>
          </div>
        </div>
      </div>

      {/* ── Route: Source → Destination ── */}
      <div className="flex items-center gap-3 rounded-lg border border-border p-4">
        <LocationChip
          name={transfer.sourceLocation.name}
          code={transfer.sourceLocation.code}
          label="Source"
        />
        <svg className="h-5 w-5 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        <LocationChip
          name={transfer.destinationLocation.name}
          code={transfer.destinationLocation.code}
          label="Destination"
        />
      </div>

      {/* ── Timeline ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TimelineCard label="Created" date={transfer.createdAt} />
        <TimelineCard label="Approved" date={transfer.approvedAt} />
        <TimelineCard label="Dispatched" date={transfer.dispatchedAt} />
        <TimelineCard label="Completed" date={transfer.completedAt} />
      </div>

      {/* ── Line Items Table ── */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Line Items
        </h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mnemonic</th>
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requested</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dispatched</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variance</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((item, i) => (
                <tr
                  key={item.id}
                  className={`border-b border-border ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <td className="px-3 py-1.5">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary">
                      {item.mnemonicSku}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-sm">{item.productName}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{item.requestedQty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{item.dispatchedQty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-success">
                    {item.receivedQty}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-destructive">
                    {item.varianceQty > 0 ? item.varianceQty : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {item.remainingReceivable > 0 ? (
                      <span className="text-warning">{item.remainingReceivable}</span>
                    ) : (
                      <span className="text-success">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Action Bar — strictly from allowedActions ── */}
      {transfer.allowedActions.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Actions
          </h3>
          <div className="flex flex-wrap gap-2">
            {transfer.allowedActions.map((action) => (
              <ActionButton
                key={action}
                action={action}
                label={transfer.actionLabels[action] ?? action}
                onClick={() => openModal(action)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Receipt History ── */}
      {transfer.receipts.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Receipt History
          </h3>
          <div className="space-y-1.5">
            {transfer.receipts.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-xs"
              >
                <span className="font-medium">
                  +{r.receivedQty} received
                  {r.notes ? ` \u2014 ${r.notes}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {transfer.notes && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </h3>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {transfer.notes}
          </p>
        </section>
      )}

      {/* ── Modals ── */}
      {activeModal === "receive" && (
        <ReceiveModal
          transfer={transfer}
          token={token}
          locationId={locationId}
          onClose={closeModal}
        />
      )}
      {activeModal === "dispatch" && (
        <DispatchModal
          transfer={transfer}
          token={token}
          locationId={locationId}
          onClose={closeModal}
        />
      )}
      {activeModal === "report_variance" && (
        <VarianceModal
          transfer={transfer}
          token={token}
          locationId={locationId}
          onClose={closeModal}
        />
      )}
      {activeModal === "approve" && (
        <SimpleActionModal
          action="approve"
          transfer={transfer}
          token={token}
          locationId={locationId}
          onClose={closeModal}
        />
      )}
      {activeModal === "start_picking" && (
        <SimpleActionModal
          action="start_picking"
          transfer={transfer}
          token={token}
          locationId={locationId}
          onClose={closeModal}
        />
      )}
      {activeModal === "cancel" && (
        <SimpleActionModal
          action="cancel"
          transfer={transfer}
          token={token}
          locationId={locationId}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Sub-components
 * ───────────────────────────────────────────── */

function LocationChip({ name, code, label }: { name: string; code: string; label: string }) {
  return (
    <div className="flex-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{name}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{code}</div>
    </div>
  );
}

function TimelineCard({ label, date }: { label: string; date: string | null }) {
  return (
    <div className="rounded-md border border-border/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-medium tabular-nums">
        {date ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014"}
      </div>
    </div>
  );
}

function ActionButton({
  action,
  label,
  onClick,
}: {
  action: string;
  label: string;
  onClick: () => void;
}) {
  const styles: Record<string, string> = {
    approve: "bg-primary text-primary-foreground hover:bg-primary/90",
    start_picking: "bg-primary text-primary-foreground hover:bg-primary/90",
    dispatch: "bg-primary text-primary-foreground hover:bg-primary/90",
    receive: "bg-success text-white hover:bg-success/90",
    report_variance: "border border-destructive text-destructive hover:bg-destructive/10",
    cancel: "border border-border text-muted-foreground hover:bg-accent",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        styles[action] ?? "border border-border hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────
 * Modal Shell (same pattern as inventory page)
 * ───────────────────────────────────────────── */
function ModalShell({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose?: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className={`w-full rounded-xl border border-border bg-background p-6 shadow-2xl animate-in zoom-in-95 duration-150 ${
            wide ? "max-w-2xl" : "max-w-md"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">{title}</h3>
            {onClose && (
              <button
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * Status Banner (shared)
 * ───────────────────────────────────────────── */
function MutationStatusBanner({
  status,
  message,
}: {
  status: TransferMutationStatus;
  message: string;
}) {
  const styles: Record<string, string> = {
    submitting: "bg-primary/5 border-primary/20 text-primary",
    success: "bg-success/10 border-success/20 text-success",
    already_processed: "bg-warning/10 border-warning/20 text-warning",
    contention_retry: "bg-warning/10 border-warning/20 text-warning",
    needs_reconcile: "bg-destructive/10 border-destructive/20 text-destructive",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
  };

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
        styles[status] ?? ""
      }`}
    >
      <span>{message}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Spinner
 * ───────────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════
 * RECEIVE MODAL — Line-based, shortage-safe
 *
 *  - Shows each line with dispatched/received/remaining
 *  - Input: receiveNowQty per line (0 to remaining)
 *  - No Full/Partial toggle — backend decides
 *  - Zero optimistic UI
 * ══════════════════════════════════════════════════════════ */
function ReceiveModal({
  transfer,
  token,
  locationId,
  onClose,
}: {
  transfer: TransferDetail;
  token: string;
  locationId: string;
  onClose: () => void;
}) {
  // Only show lines with remaining receivable > 0
  const receivableItems = useMemo(
    () => transfer.items.filter((item) => item.remainingReceivable > 0),
    [transfer.items],
  );

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const item of receivableItems) {
      init[item.id] = 0;
    }
    return init;
  });

  const [notes, setNotes] = useState("");

  const { submit, status, statusMessage, isSubmitting, reset } = useReceiveMutation(
    token,
    locationId,
    transfer.transferNo,
  );

  const hasAtLeastOne = Object.values(quantities).some((q) => q > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAtLeastOne || isSubmitting) return;

    const lines: ReceiveLineInput[] = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([transferItemId, receiveQty]) => ({ transferItemId, receiveQty }));

    submit(transfer.id, { lines, notes: notes.trim() || undefined });
  };

  // Auto-close on success
  useEffect(() => {
    if (status === "success" || status === "already_processed") {
      const timer = setTimeout(() => {
        reset();
        onClose();
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onClose]);

  return (
    <ModalShell
      title={`Receive into ${transfer.destinationLocation.name}`}
      onClose={isSubmitting ? undefined : onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Enter the quantity actually received for each line item. The system will determine if this is a full or partial receipt.
        </p>

        {/* Line items */}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dispatched</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Already Recv</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remaining</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Receive Now</th>
              </tr>
            </thead>
            <tbody>
              {receivableItems.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="px-3 py-2">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary">
                      {item.mnemonicSku}
                    </span>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate max-w-[200px]">
                      {item.productName}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.dispatchedQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">{item.receivedQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-warning">
                    {item.remainingReceivable}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      max={item.remainingReceivable}
                      value={quantities[item.id] ?? 0}
                      onChange={(e) => {
                        const val = Math.min(
                          Math.max(0, parseInt(e.target.value) || 0),
                          item.remainingReceivable,
                        );
                        setQuantities((prev) => ({ ...prev, [item.id]: val }));
                      }}
                      disabled={isSubmitting}
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Notes <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Receipt notes..."
            rows={2}
            disabled={isSubmitting}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>

        {statusMessage && <MutationStatusBanner status={status} message={statusMessage} />}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={!hasAtLeastOne || isSubmitting}
            className="flex-1 rounded-md bg-success px-3 py-2 text-sm font-medium text-white hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Processing...
              </span>
            ) : (
              "Confirm Receipt"
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════
 * DISPATCH MODAL — Line-based
 * ══════════════════════════════════════════════════════════ */
function DispatchModal({
  transfer,
  token,
  locationId,
  onClose,
}: {
  transfer: TransferDetail;
  token: string;
  locationId: string;
  onClose: () => void;
}) {
  const dispatchableItems = useMemo(
    () => transfer.items.filter((item) => item.remainingDispatchable > 0),
    [transfer.items],
  );

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const item of dispatchableItems) {
      // Default to full dispatch
      init[item.id] = item.remainingDispatchable;
    }
    return init;
  });

  const [notes, setNotes] = useState("");

  const { submit, status, statusMessage, isSubmitting, reset } = useDispatchMutation(
    token,
    locationId,
    transfer.transferNo,
  );

  const hasAtLeastOne = Object.values(quantities).some((q) => q > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAtLeastOne || isSubmitting) return;

    const lines: DispatchLineInput[] = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([transferItemId, dispatchQty]) => ({ transferItemId, dispatchQty }));

    submit(transfer.id, { lines, notes: notes.trim() || undefined });
  };

  useEffect(() => {
    if (status === "success" || status === "already_processed") {
      const timer = setTimeout(() => { reset(); onClose(); }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onClose]);

  return (
    <ModalShell
      title={`Dispatch from ${transfer.sourceLocation.name}`}
      onClose={isSubmitting ? undefined : onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Enter the quantity to dispatch for each line item. Stock will move from source to transit buffer.
        </p>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requested</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Already Sent</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remaining</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dispatch Now</th>
              </tr>
            </thead>
            <tbody>
              {dispatchableItems.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="px-3 py-2">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary">
                      {item.mnemonicSku}
                    </span>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate max-w-[200px]">
                      {item.productName}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.requestedQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.dispatchedQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-warning">
                    {item.remainingDispatchable}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      max={item.remainingDispatchable}
                      value={quantities[item.id] ?? 0}
                      onChange={(e) => {
                        const val = Math.min(
                          Math.max(0, parseInt(e.target.value) || 0),
                          item.remainingDispatchable,
                        );
                        setQuantities((prev) => ({ ...prev, [item.id]: val }));
                      }}
                      disabled={isSubmitting}
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Dispatch notes..."
            rows={2}
            disabled={isSubmitting}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>

        {statusMessage && <MutationStatusBanner status={status} message={statusMessage} />}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={!hasAtLeastOne || isSubmitting}
            className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2"><Spinner /> Processing...</span>
            ) : (
              "Confirm Dispatch"
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════
 * VARIANCE MODAL — Separate workflow
 *
 *  - Shows only lines with unaccounted items (remaining > 0)
 *  - Reason code: DAMAGE_IN_TRANSIT or TRANSFER_SHORTAGE_CONFIRMED
 *  - Admin/Manager only (enforced by backend allowedActions)
 * ══════════════════════════════════════════════════════════ */

const VARIANCE_REASONS: { value: string; label: string }[] = [
  { value: "DAMAGE_IN_TRANSIT", label: "Damage in Transit" },
  { value: "TRANSFER_SHORTAGE_CONFIRMED", label: "Transfer Shortage (Confirmed)" },
];

function VarianceModal({
  transfer,
  token,
  locationId,
  onClose,
}: {
  transfer: TransferDetail;
  token: string;
  locationId: string;
  onClose: () => void;
}) {
  // Only lines with unaccounted items
  const unaccountedItems = useMemo(
    () => transfer.items.filter((item) => item.remainingReceivable > 0),
    [transfer.items],
  );

  const [lines, setLines] = useState<
    Record<string, { qty: number; reasonCode: string; notes: string }>
  >(() => {
    const init: Record<string, { qty: number; reasonCode: string; notes: string }> = {};
    for (const item of unaccountedItems) {
      init[item.id] = { qty: 0, reasonCode: "", notes: "" };
    }
    return init;
  });

  const { submit, status, statusMessage, isSubmitting, reset } = useVarianceMutation(
    token,
    locationId,
    transfer.transferNo,
  );

  const hasAtLeastOne = Object.values(lines).some(
    (l) => l.qty > 0 && l.reasonCode !== "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAtLeastOne || isSubmitting) return;

    const varianceLines: VarianceLineInput[] = Object.entries(lines)
      .filter(([, l]) => l.qty > 0 && l.reasonCode !== "")
      .map(([transferItemId, l]) => ({
        transferItemId,
        varianceQty: l.qty,
        reasonCode: l.reasonCode,
        notes: l.notes.trim() || undefined,
      }));

    submit(transfer.id, { lines: varianceLines });
  };

  useEffect(() => {
    if (status === "success" || status === "already_processed") {
      const timer = setTimeout(() => { reset(); onClose(); }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onClose]);

  return (
    <ModalShell
      title="Report Variance"
      onClose={isSubmitting ? undefined : onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Report missing or damaged items still in transit buffer. This will write off stock and close the discrepancy.
        </p>

        <div className="space-y-3">
          {unaccountedItems.map((item) => {
            const line = lines[item.id];
            return (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary">
                      {item.mnemonicSku}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{item.productName}</span>
                  </div>
                  <span className="text-xs font-medium text-warning">
                    {item.remainingReceivable} unaccounted
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground">Variance Qty</label>
                    <input
                      type="number"
                      min="0"
                      max={item.remainingReceivable}
                      value={line?.qty ?? 0}
                      onChange={(e) => {
                        const val = Math.min(
                          Math.max(0, parseInt(e.target.value) || 0),
                          item.remainingReceivable,
                        );
                        setLines((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], qty: val },
                        }));
                      }}
                      disabled={isSubmitting}
                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground">Reason</label>
                    <select
                      value={line?.reasonCode ?? ""}
                      onChange={(e) =>
                        setLines((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], reasonCode: e.target.value },
                        }))
                      }
                      disabled={isSubmitting}
                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    >
                      <option value="">Select...</option>
                      {VARIANCE_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground">Notes</label>
                    <input
                      type="text"
                      value={line?.notes ?? ""}
                      onChange={(e) =>
                        setLines((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], notes: e.target.value },
                        }))
                      }
                      disabled={isSubmitting}
                      placeholder="Optional"
                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {statusMessage && <MutationStatusBanner status={status} message={statusMessage} />}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={!hasAtLeastOne || isSubmitting}
            className="flex-1 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2"><Spinner /> Processing...</span>
            ) : (
              "Confirm Variance Report"
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════
 * SIMPLE ACTION MODAL — Approve, Start Picking, Cancel
 *
 *  Confirmation dialog with optional notes
 * ══════════════════════════════════════════════════════════ */
function SimpleActionModal({
  action,
  transfer,
  token,
  locationId,
  onClose,
}: {
  action: "approve" | "start_picking" | "cancel";
  transfer: TransferDetail;
  token: string;
  locationId: string;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");

  const approveMut = useApproveMutation(token, locationId, transfer.transferNo);
  const pickMut = useStartPickingMutation(token, locationId, transfer.transferNo);
  const cancelMut = useCancelMutation(token, locationId, transfer.transferNo);

  const activeMut =
    action === "approve" ? approveMut : action === "start_picking" ? pickMut : cancelMut;

  const titles: Record<string, string> = {
    approve: "Approve Transfer",
    start_picking: `Start Picking at ${transfer.sourceLocation.name}`,
    cancel: "Cancel Transfer",
  };

  const descriptions: Record<string, string> = {
    approve: `Approving will reserve stock at ${transfer.sourceLocation.name} for all line items.`,
    start_picking: "This marks the transfer as being actively picked at the source location.",
    cancel: "Cancelling will release all reserved stock and cannot be undone.",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeMut.isSubmitting) return;

    if (action === "approve") {
      approveMut.submit(transfer.id, { notes: notes.trim() || undefined });
    } else if (action === "start_picking") {
      pickMut.submit(transfer.id, {});
    } else {
      cancelMut.submit(transfer.id, { notes: notes.trim() || undefined });
    }
  };

  useEffect(() => {
    if (activeMut.status === "success" || activeMut.status === "already_processed") {
      const timer = setTimeout(() => { activeMut.reset(); onClose(); }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [activeMut.status, activeMut, onClose]);

  return (
    <ModalShell
      title={titles[action]}
      onClose={activeMut.isSubmitting ? undefined : onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">{descriptions[action]}</p>

        {action !== "start_picking" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              disabled={activeMut.isSubmitting}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>
        )}

        {activeMut.statusMessage && (
          <MutationStatusBanner status={activeMut.status} message={activeMut.statusMessage} />
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={activeMut.isSubmitting}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              action === "cancel"
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {activeMut.isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Processing...
              </span>
            ) : (
              titles[action]
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={activeMut.isSubmitting}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Go Back
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
