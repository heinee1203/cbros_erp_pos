"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  useJobCardQuery,
  useServiceOperationsQuery,
  useJobCardJournalQuery,
  type JobCardDetail,
  type JCPartLine,
  type JCLaborLine,
  type ServiceOperation,
  type JCJournalEntry,
} from "@/hooks/use-job-card-query";
import {
  useTransitionMutation,
  useApproveMutation,
  useAddLaborMutation,
  useAddPartsMutation,
  useIssuePartsMutation,
  useReturnPartsMutation,
  useCancelJobCardMutation,
  type JCMutationStatus,
} from "@/hooks/use-job-card-mutations";
import { useAuth } from "@/app/auth-context";

// ── Status configuration ──

const STATUS_ORDER = [
  "SCHEDULED",
  "CHECKED_IN",
  "ESTIMATING",
  "APPROVED",
  "WAITING_FOR_PARTS",
  "READY_FOR_BAY",
  "IN_PROGRESS",
  "WORK_COMPLETED",
  "INVOICED",
  "CLOSED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CHECKED_IN: "Checked In",
  ESTIMATING: "Estimating",
  APPROVED: "Approved",
  WAITING_FOR_PARTS: "Waiting Parts",
  READY_FOR_BAY: "Ready for Bay",
  IN_PROGRESS: "In Progress",
  WORK_COMPLETED: "Work Done",
  INVOICED: "Invoiced",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  CHECKED_IN: "bg-blue-50 text-blue-700",
  ESTIMATING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-indigo-50 text-indigo-700",
  WAITING_FOR_PARTS: "bg-orange-50 text-orange-700",
  READY_FOR_BAY: "bg-cyan-50 text-cyan-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  WORK_COMPLETED: "bg-emerald-50 text-emerald-700",
  INVOICED: "bg-green-50 text-green-700",
  CLOSED: "bg-success/10 text-success",
  CANCELLED: "bg-destructive/10 text-destructive",
};

/** Action label mapping (human-readable button text) */
const ACTION_LABELS: Record<string, string> = {
  check_in: "Check In Vehicle",
  start_estimating: "Start Estimating",
  approve: "Approve & Reserve Parts",
  move_to_bay: "Move to Bay",
  start_work: "Start Work",
  complete_work: "Mark Work Complete",
  invoice: "Generate Invoice",
  close: "Close Job Card",
  cancel: "Cancel Job Card",
};

/** Map action names to route endpoints */
const ACTION_ENDPOINTS: Record<string, string> = {
  check_in: "check-in",
  start_estimating: "start-estimating",
  move_to_bay: "move-to-bay",
  start_work: "start-work",
  complete_work: "complete-work",
  invoice: "invoice",
  close: "close",
};

const TABS = ["estimate", "parts-usage", "activity", "billing"] as const;
type TabId = (typeof TABS)[number];

const TAB_LABELS: Record<TabId, string> = {
  estimate: "Estimate",
  "parts-usage": "Parts Usage",
  activity: "Activity / Journal",
  billing: "Billing Summary",
};

/* ══════════════════════════════════════════════════════════
 * Job Card Service Workspace — /service/job-cards/[jobNo]
 *
 * 2-column SaaS layout. Left: sticky summary. Right: tabbed workspace.
 * Zero optimistic UI. All state from backend refetch.
 * Actionable buttons rendered from allowedActions array.
 * ══════════════════════════════════════════════════════════ */
export default function JobCardDetailPage() {
  const { token, locationId } = useAuth();
  const params = useParams<{ jobNo: string }>();
  const jobNo = params.jobNo;
  const [activeTab, setActiveTab] = useState<TabId>("estimate");

  const {
    data: jc,
    isLoading,
    error,
  } = useJobCardQuery(jobNo, token, locationId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading {jobNo}...</div>
      </div>
    );
  }

  if (error || !jc) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="text-sm font-medium text-destructive">
          {error instanceof Error ? error.message : "Job card not found"}
        </div>
        <a
          href="/service/job-cards"
          className="text-xs text-muted-foreground underline"
        >
          &larr; Back to Job Cards
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* ── Status Timeline ── */}
      <StatusTimeline status={jc.status} />

      {/* ── 2-Column Layout ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Left Column: Sticky Summary */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <JobSummaryCard jc={jc} />
          <div className="mt-4">
            <ActionButtons jc={jc} />
          </div>
        </div>

        {/* Right Column: Tabbed Workspace */}
        <div>
          {/* Tab Bar */}
          <div className="flex gap-1 border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="pt-5">
            {activeTab === "estimate" && <EstimateTab jc={jc} />}
            {activeTab === "parts-usage" && <PartsUsageTab jc={jc} />}
            {activeTab === "activity" && <ActivityTab jc={jc} />}
            {activeTab === "billing" && <BillingTab jc={jc} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * STATUS TIMELINE — Visual horizontal timeline
 * ══════════════════════════════════════════════════════════ */
function StatusTimeline({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
        <span className="text-sm font-semibold text-destructive">✕ CANCELLED</span>
      </div>
    );
  }

  const currentIdx = STATUS_ORDER.indexOf(status as any);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-0.5">
        {STATUS_ORDER.map((s, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <div key={s} className="flex flex-1 items-center">
              {/* Node */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                    isCurrent
                      ? "bg-foreground text-background ring-2 ring-foreground/20 ring-offset-2"
                      : isPast
                        ? "bg-success text-white"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isPast ? "✓" : idx + 1}
                </div>
                <span
                  className={`text-center text-[10px] leading-tight ${
                    isCurrent
                      ? "font-semibold text-foreground"
                      : isPast
                        ? "text-success"
                        : "text-muted-foreground"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </span>
              </div>

              {/* Connector line */}
              {idx < STATUS_ORDER.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 ${
                    isPast ? "bg-success" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * JOB SUMMARY CARD — Sticky left column
 * ══════════════════════════════════════════════════════════ */
function JobSummaryCard({ jc }: { jc: JobCardDetail }) {
  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-sm font-bold">{jc.jobNo}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[jc.status] ?? "bg-muted text-muted-foreground"}`}
        >
          {STATUS_LABELS[jc.status] ?? jc.status}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-3 px-4 py-3">
        <SummaryRow label="Customer" value={jc.customer?.name ?? "—"} />
        <SummaryRow
          label="Vehicle"
          value={
            jc.vehicle
              ? `${jc.vehicle.year ?? ""} ${jc.vehicle.make} ${jc.vehicle.model}`.trim()
              : "—"
          }
        />
        {jc.vehicle?.plateNo && (
          <SummaryRow label="Plate No." value={jc.vehicle.plateNo} />
        )}
        <SummaryRow
          label="Location"
          value={jc.location ? `${jc.location.name} (${jc.location.code})` : "—"}
        />
        {jc.odometerReading != null && (
          <SummaryRow
            label="Odometer"
            value={`${jc.odometerReading.toLocaleString()} km`}
          />
        )}
        {jc.assignedTechnicianUserId && (
          <SummaryRow label="Technician" value="Assigned" />
        )}
      </div>

      {/* Timestamps */}
      <div className="border-t border-border px-4 py-3">
        <div className="space-y-1">
          <TimeRow label="Created" ts={jc.createdAt} />
          {jc.checkedInAt && <TimeRow label="Checked In" ts={jc.checkedInAt} />}
          {jc.approvedAt && <TimeRow label="Approved" ts={jc.approvedAt} />}
          {jc.startedAt && <TimeRow label="Started" ts={jc.startedAt} />}
          {jc.completedAt && <TimeRow label="Completed" ts={jc.completedAt} />}
          {jc.invoicedAt && <TimeRow label="Invoiced" ts={jc.invoicedAt} />}
          {jc.closedAt && <TimeRow label="Closed" ts={jc.closedAt} />}
          {jc.cancelledAt && (
            <TimeRow label="Cancelled" ts={jc.cancelledAt} />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}

function TimeRow({ label, ts }: { label: string; ts: string }) {
  const d = new Date(ts);
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * ACTION BUTTONS — Rendered strictly from allowedActions
 * ══════════════════════════════════════════════════════════ */
function ActionButtons({ jc }: { jc: JobCardDetail }) {
  const actions = jc.allowedActions;

  if (actions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-center text-xs text-muted-foreground">
        No actions available
      </div>
    );
  }

  // Separate primary workflow actions from cancel/special
  const primaryActions = actions.filter(
    (a) => !a.startsWith("cancel") && !a.includes("add_") && !a.includes("issue") && !a.includes("return"),
  );
  const cancelAction = actions.find((a) => a === "cancel");
  const cancelBlocked = actions.includes("cancel_blocked_net_issued");

  return (
    <div className="space-y-2">
      {/* Primary state transition buttons */}
      {primaryActions.map((action) => {
        if (action === "approve") {
          return <ApproveButton key={action} jc={jc} />;
        }
        return (
          <TransitionButton key={action} jc={jc} action={action} />
        );
      })}

      {/* Cancel button */}
      {cancelAction && (
        <CancelButton jc={jc} />
      )}
      {cancelBlocked && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
          Cancel blocked — return all issued parts first
        </div>
      )}
    </div>
  );
}

/** Generic transition button */
function TransitionButton({ jc, action }: { jc: JobCardDetail; action: string }) {
  const { token, locationId } = useAuth();
  const endpoint = ACTION_ENDPOINTS[action];
  if (!endpoint) return null;

  const mutation = useTransitionMutation(token, locationId, jc.jobNo, endpoint);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          Confirm: {ACTION_LABELS[action] ?? action}?
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              mutation.submit(jc.id, {});
              setConfirming(false);
            }}
            disabled={mutation.isSubmitting}
            className="flex-1 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isSubmitting ? "Processing..." : "Confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
        <MutationStatus status={mutation.status} message={mutation.statusMessage} />
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full rounded-md bg-foreground px-3 py-2.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
    >
      {ACTION_LABELS[action] ?? action}
    </button>
  );
}

/** Approve button with pre-submit summary */
function ApproveButton({ jc }: { jc: JobCardDetail }) {
  const { token, locationId } = useAuth();
  const mutation = useApproveMutation(token, locationId, jc.jobNo);
  const [showSummary, setShowSummary] = useState(false);

  const laborTotal = jc.laborLines.reduce(
    (sum, l) => sum + parseFloat(l.lineTotal),
    0,
  );
  const partsTotal = jc.partLines.reduce(
    (sum, p) => sum + p.plannedQty * parseFloat(p.unitPrice),
    0,
  );
  const totalLines = jc.laborLines.length + jc.partLines.length;

  if (showSummary) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-3">
        <p className="text-xs font-semibold text-indigo-900">
          Approve & Reserve Parts — Summary
        </p>
        <div className="space-y-1 text-xs text-indigo-800">
          <div className="flex justify-between">
            <span>Labor ({jc.laborLines.length} lines)</span>
            <span className="font-mono">${laborTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Parts ({jc.partLines.length} lines)</span>
            <span className="font-mono">${partsTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-indigo-200 pt-1 font-semibold">
            <span>Estimated Total</span>
            <span className="font-mono">${(laborTotal + partsTotal).toFixed(2)}</span>
          </div>
        </div>
        {totalLines === 0 && (
          <p className="text-[11px] text-orange-600">
            ⚠ No labor or parts lines. Approval will proceed with an empty estimate.
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              mutation.submit(jc.id, {});
              setShowSummary(false);
            }}
            disabled={mutation.isSubmitting}
            className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isSubmitting ? "Reserving..." : "Approve & Reserve"}
          </button>
          <button
            onClick={() => setShowSummary(false)}
            className="rounded-md border border-indigo-200 px-3 py-2 text-xs text-indigo-700 hover:bg-indigo-100"
          >
            Back
          </button>
        </div>
        <MutationStatus status={mutation.status} message={mutation.statusMessage} />
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowSummary(true)}
      className="w-full rounded-md bg-indigo-600 px-3 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
    >
      Approve & Reserve Parts
    </button>
  );
}

/** Cancel button */
function CancelButton({ jc }: { jc: JobCardDetail }) {
  const { token, locationId } = useAuth();
  const mutation = useCancelJobCardMutation(token, locationId, jc.jobNo);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-destructive">Confirm cancellation?</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              mutation.submit(jc.id, {});
              setConfirming(false);
            }}
            disabled={mutation.isSubmitting}
            className="flex-1 rounded-md bg-destructive px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isSubmitting ? "Cancelling..." : "Yes, Cancel"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            No
          </button>
        </div>
        <MutationStatus status={mutation.status} message={mutation.statusMessage} />
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full rounded-md border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5"
    >
      Cancel Job Card
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
 * ESTIMATE TAB — Add Labor + Parts, Show Availability
 * ══════════════════════════════════════════════════════════ */
function EstimateTab({ jc }: { jc: JobCardDetail }) {
  const canEdit = [
    "ESTIMATING",
    "APPROVED",
    "WAITING_FOR_PARTS",
    "READY_FOR_BAY",
    "IN_PROGRESS",
  ].includes(jc.status);

  const [showLaborModal, setShowLaborModal] = useState(false);
  const [showPartsModal, setShowPartsModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* WAITING_FOR_PARTS readiness panel */}
      {jc.status === "WAITING_FOR_PARTS" && (
        <ReadinessPanel jc={jc} />
      )}

      {/* Labor Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Labor Lines</h3>
          {canEdit && jc.allowedActions.includes("add_labor") && (
            <button
              onClick={() => setShowLaborModal(true)}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              + Add Labor
            </button>
          )}
        </div>

        {jc.laborLines.length === 0 ? (
          <EmptyState text="No labor lines yet" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Operation</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Hours</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jc.laborLines.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px]">{l.opCode}</span>
                      <span className="ml-1.5 text-muted-foreground">{l.opName}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.description || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.qtyHours}</td>
                    <td className="px-3 py-2 text-right font-mono">${l.unitPrice}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium">
                      ${l.lineTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right font-medium">
                    Labor Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    $
                    {jc.laborLines
                      .reduce((s, l) => s + parseFloat(l.lineTotal), 0)
                      .toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Parts Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Parts Lines</h3>
          {canEdit && jc.allowedActions.includes("add_parts") && (
            <button
              onClick={() => setShowPartsModal(true)}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              + Add Parts
            </button>
          )}
        </div>

        {jc.partLines.length === 0 ? (
          <EmptyState text="No parts lines yet" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Planned</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Reserved</th>
                  <th scope="col" className="px-3 py-2 text-center font-medium text-muted-foreground">Availability</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jc.partLines.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-[11px]">{p.mnemonicSku}</td>
                    <td className="px-3 py-2">{p.productName}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.plannedQty}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.reservedQty}</td>
                    <td className="px-3 py-2 text-center">
                      <AvailabilityBadge part={p} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">${p.unitPrice}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium">
                      ${(p.plannedQty * parseFloat(p.unitPrice)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-right font-medium">
                    Parts Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    $
                    {jc.partLines
                      .reduce(
                        (s, p) => s + p.plannedQty * parseFloat(p.unitPrice),
                        0,
                      )
                      .toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Modals */}
      {showLaborModal && (
        <AddLaborModal jc={jc} onClose={() => setShowLaborModal(false)} />
      )}
      {showPartsModal && (
        <AddPartsModal jc={jc} onClose={() => setShowPartsModal(false)} />
      )}
    </div>
  );
}

/** Availability badge — business language */
function AvailabilityBadge({ part }: { part: JCPartLine }) {
  if (part.reservedQty >= part.plannedQty) {
    return (
      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
        Fully Available
      </span>
    );
  }
  if (part.reservedQty > 0) {
    return (
      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
        Partially Reserved
      </span>
    );
  }
  if (part.issuedQty > 0) {
    return (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
        Issued ({part.issuedQty})
      </span>
    );
  }
  return (
    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
      Backordered
    </span>
  );
}

/** WAITING_FOR_PARTS readiness panel */
function ReadinessPanel({ jc }: { jc: JobCardDetail }) {
  const allReserved = jc.partLines.every((p) => p.reservedQty >= p.plannedQty);
  const shortfall = jc.partLines.filter((p) => p.reservedQty < p.plannedQty);

  return (
    <div
      className={`rounded-lg border p-4 ${
        allReserved
          ? "border-success/30 bg-success/5"
          : "border-orange-200 bg-orange-50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">
          {allReserved ? "✓ All Parts Reserved" : "Parts Readiness"}
        </h4>
        {!allReserved && (
          <span className="text-xs text-orange-700">
            {shortfall.length} part{shortfall.length > 1 ? "s" : ""} with shortfall
          </span>
        )}
      </div>

      {!allReserved && (
        <div className="space-y-1 mb-3">
          {shortfall.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className="text-orange-800">
                {p.mnemonicSku} — {p.productName}
              </span>
              <span className="font-mono text-orange-700">
                {p.reservedQty}/{p.plannedQty} reserved
              </span>
            </div>
          ))}
        </div>
      )}

      {allReserved && jc.allowedActions.includes("move_to_bay") && (
        <p className="text-xs text-success">
          All parts are reserved. Job card can be moved to bay.
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * ADD LABOR MODAL
 * ══════════════════════════════════════════════════════════ */
function AddLaborModal({
  jc,
  onClose,
}: {
  jc: JobCardDetail;
  onClose: () => void;
}) {
  const { token, locationId } = useAuth();
  const { data: opsData } = useServiceOperationsQuery(token, locationId);
  const mutation = useAddLaborMutation(token, locationId, jc.jobNo);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{
    op: ServiceOperation;
    qtyHours: string;
    unitPrice: string;
    description: string;
  } | null>(null);

  const ops = opsData?.data?.filter((o) => o.active) ?? [];
  const filtered = ops.filter(
    (o) =>
      o.code.toLowerCase().includes(search.toLowerCase()) ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.category.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = () => {
    if (!selected) return;
    mutation.submit(jc.id, {
      lines: [
        {
          serviceOperationId: selected.op.id,
          description: selected.description || undefined,
          qtyHours: selected.qtyHours,
          unitPrice: selected.unitPrice,
        },
      ],
    });
  };

  // Close on success
  if (mutation.status === "success") {
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose} title="Add Labor Line">
      {!selected ? (
        /* Operation Search */
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search operations by code, name, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-md border border-border">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                No matching operations
              </div>
            ) : (
              filtered.map((op) => (
                <button
                  key={op.id}
                  onClick={() =>
                    setSelected({
                      op,
                      qtyHours: op.estimatedHours,
                      unitPrice: op.defaultLaborRate,
                      description: "",
                    })
                  }
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <div>
                    <span className="font-mono text-xs font-medium">{op.code}</span>
                    <span className="ml-2 text-xs">{op.name}</span>
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {op.category}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {op.estimatedHours}h × ${op.defaultLaborRate}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Selected operation — edit details */
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold">{selected.op.code}</span>
              <span className="text-xs">{selected.op.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Hours</span>
              <input
                type="text"
                value={selected.qtyHours}
                onChange={(e) =>
                  setSelected({ ...selected, qtyHours: e.target.value })
                }
                className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Rate ($/hr)</span>
              <input
                type="text"
                value={selected.unitPrice}
                onChange={(e) =>
                  setSelected({ ...selected, unitPrice: e.target.value })
                }
                className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Description (optional)</span>
            <input
              type="text"
              value={selected.description}
              onChange={(e) =>
                setSelected({ ...selected, description: e.target.value })
              }
              placeholder="Override description..."
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </label>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back to search
            </button>
            <button
              onClick={handleAdd}
              disabled={mutation.isSubmitting}
              className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isSubmitting ? "Adding..." : "Add Labor Line"}
            </button>
          </div>

          <MutationStatus status={mutation.status} message={mutation.statusMessage} />
        </div>
      )}
    </ModalOverlay>
  );
}

/* ══════════════════════════════════════════════════════════
 * ADD PARTS MODAL
 * ══════════════════════════════════════════════════════════ */
function AddPartsModal({
  jc,
  onClose,
}: {
  jc: JobCardDetail;
  onClose: () => void;
}) {
  const { token, locationId } = useAuth();
  const mutation = useAddPartsMutation(token, locationId, jc.jobNo);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [plannedQty, setPlannedQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  const handleAdd = () => {
    if (!productId || !plannedQty || !unitPrice) return;
    mutation.submit(jc.id, {
      lines: [
        {
          productId,
          locationId: jc.locationId,
          plannedQty: parseInt(plannedQty, 10),
          unitPrice,
        },
      ],
    });
  };

  if (mutation.status === "success") {
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose} title="Add Part Line">
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Product ID / SKU</span>
          <input
            type="text"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="Enter product UUID or scan barcode..."
            className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-foreground/20"
            autoFocus
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Planned Qty</span>
            <input
              type="number"
              min="1"
              value={plannedQty}
              onChange={(e) => setPlannedQty(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Unit Price ($)</span>
            <input
              type="text"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={mutation.isSubmitting || !productId || !unitPrice}
            className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isSubmitting ? "Adding..." : "Add Part"}
          </button>
        </div>

        <MutationStatus status={mutation.status} message={mutation.statusMessage} />
      </div>
    </ModalOverlay>
  );
}

/* ══════════════════════════════════════════════════════════
 * PARTS USAGE TAB — Mechanic Workflow
 * Issue/Return with simple qty inputs
 * ══════════════════════════════════════════════════════════ */
function PartsUsageTab({ jc }: { jc: JobCardDetail }) {
  const canIssue = jc.allowedActions.includes("issue_parts");
  const canReturn = jc.allowedActions.includes("return_parts");
  const [issueModalPart, setIssueModalPart] = useState<JCPartLine | null>(null);
  const [returnModalPart, setReturnModalPart] = useState<JCPartLine | null>(null);

  if (jc.partLines.length === 0) {
    return <EmptyState text="No parts on this job card" />;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
              <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
              <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                Reserved
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                Issued
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                Returned
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                Net Used
              </th>
              <th scope="col" className="px-3 py-2 text-center font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jc.partLines.map((p) => {
              const netUsed = p.issuedQty - p.returnedQty;
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-mono text-[11px]">{p.mnemonicSku}</td>
                  <td className="px-3 py-2.5">{p.productName}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className="text-muted-foreground">{p.reservedQty}</span>
                    <span className="text-[10px] text-muted-foreground"> for job</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {p.issuedQty > 0 ? (
                      <span className="font-semibold">{p.issuedQty}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {p.returnedQty > 0 ? (
                      <span className="text-warning">{p.returnedQty}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold">
                    {netUsed}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {canIssue && (
                        <button
                          onClick={() => setIssueModalPart(p)}
                          className="rounded border border-border px-2 py-1 text-[10px] font-medium hover:bg-muted"
                        >
                          Issue
                        </button>
                      )}
                      {canReturn && p.issuedQty - p.returnedQty > 0 && (
                        <button
                          onClick={() => setReturnModalPart(p)}
                          className="rounded border border-warning/30 px-2 py-1 text-[10px] font-medium text-warning hover:bg-warning/5"
                        >
                          Return
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Context legend */}
      <div className="flex gap-4 text-[10px] text-muted-foreground">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />
          Reserved = parts set aside for this job
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-foreground" />
          Issued = physically handed to mechanic
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-warning" />
          Returned = given back to stock
        </span>
      </div>

      {/* Modals */}
      {issueModalPart && (
        <IssuePartModal
          jc={jc}
          part={issueModalPart}
          onClose={() => setIssueModalPart(null)}
        />
      )}
      {returnModalPart && (
        <ReturnPartModal
          jc={jc}
          part={returnModalPart}
          onClose={() => setReturnModalPart(null)}
        />
      )}
    </div>
  );
}

/** Issue Part Modal — simple qty input */
function IssuePartModal({
  jc,
  part,
  onClose,
}: {
  jc: JobCardDetail;
  part: JCPartLine;
  onClose: () => void;
}) {
  const { token, locationId } = useAuth();
  const mutation = useIssuePartsMutation(token, locationId, jc.jobNo);
  const [qty, setQty] = useState("1");

  const maxIssuable = part.plannedQty - (part.reservedQty + part.issuedQty - part.returnedQty);
  const parsedQty = parseInt(qty, 10) || 0;

  const handleIssue = () => {
    if (parsedQty <= 0) return;
    mutation.submit(jc.id, {
      lines: [{ jobCardPartId: part.id, issueQty: parsedQty }],
    });
  };

  if (mutation.status === "success") {
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose} title="Issue Parts">
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="text-xs font-medium">
            {part.mnemonicSku} — {part.productName}
          </div>
        </div>

        {/* Context — no expose of consume_reserved vs direct_issue */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-border p-2">
            <div className="text-lg font-bold font-mono">{part.reservedQty}</div>
            <div className="text-[10px] text-muted-foreground">Reserved for Job</div>
          </div>
          <div className="rounded-md border border-border p-2">
            <div className="text-lg font-bold font-mono">{part.issuedQty - part.returnedQty}</div>
            <div className="text-[10px] text-muted-foreground">Already Issued</div>
          </div>
          <div className="rounded-md border border-border p-2">
            <div className="text-lg font-bold font-mono">{part.plannedQty}</div>
            <div className="text-[10px] text-muted-foreground">Planned Total</div>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Issue Now Qty</span>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2.5 text-lg font-mono text-center outline-none focus:ring-2 focus:ring-foreground/20"
            autoFocus
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleIssue}
            disabled={mutation.isSubmitting || parsedQty <= 0}
            className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isSubmitting ? "Issuing..." : `Issue ${parsedQty} Unit${parsedQty !== 1 ? "s" : ""}`}
          </button>
        </div>

        <MutationStatus status={mutation.status} message={mutation.statusMessage} />
      </div>
    </ModalOverlay>
  );
}

/** Return Part Modal — simple qty input */
function ReturnPartModal({
  jc,
  part,
  onClose,
}: {
  jc: JobCardDetail;
  part: JCPartLine;
  onClose: () => void;
}) {
  const { token, locationId } = useAuth();
  const mutation = useReturnPartsMutation(token, locationId, jc.jobNo);
  const [qty, setQty] = useState("1");

  const maxReturnable = part.issuedQty - part.returnedQty;
  const parsedQty = parseInt(qty, 10) || 0;

  const handleReturn = () => {
    if (parsedQty <= 0 || parsedQty > maxReturnable) return;
    mutation.submit(jc.id, {
      lines: [{ jobCardPartId: part.id, returnQty: parsedQty }],
    });
  };

  if (mutation.status === "success") {
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose} title="Return Parts">
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="text-xs font-medium">
            {part.mnemonicSku} — {part.productName}
          </div>
        </div>

        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          Returning parts restores stock to inventory. Max returnable: {maxReturnable}
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Return Now Qty</span>
          <input
            type="number"
            min="1"
            max={maxReturnable}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2.5 text-lg font-mono text-center outline-none focus:ring-2 focus:ring-foreground/20"
            autoFocus
          />
          {parsedQty > maxReturnable && (
            <span className="text-[10px] text-destructive">
              Cannot return more than {maxReturnable} (issued − already returned)
            </span>
          )}
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleReturn}
            disabled={mutation.isSubmitting || parsedQty <= 0 || parsedQty > maxReturnable}
            className="rounded-md bg-warning px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isSubmitting ? "Returning..." : `Return ${parsedQty} Unit${parsedQty !== 1 ? "s" : ""}`}
          </button>
        </div>

        <MutationStatus status={mutation.status} message={mutation.statusMessage} />
      </div>
    </ModalOverlay>
  );
}

/* ══════════════════════════════════════════════════════════
 * ACTIVITY / JOURNAL TAB
 * ══════════════════════════════════════════════════════════ */
function ActivityTab({ jc }: { jc: JobCardDetail }) {
  const { token, locationId } = useAuth();
  const { data: journal, isLoading } = useJobCardJournalQuery(
    jc.id,
    token,
    locationId,
  );

  return (
    <div className="space-y-5">
      {/* Notes */}
      {jc.notes && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Notes
          </h4>
          <pre className="whitespace-pre-wrap text-xs leading-relaxed">
            {jc.notes}
          </pre>
        </div>
      )}

      {/* Stock Journal */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">Stock Journal</h4>
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading journal...</div>
        ) : !journal || journal.length === 0 ? (
          <EmptyState text="No stock journal entries yet" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Time
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Change
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Balance
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {journal.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          e.referenceType === "JOB_CARD_ISSUE"
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {e.referenceType === "JOB_CARD_ISSUE" ? "ISSUE" : "RETURN"}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${
                        e.changeQuantity < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {e.changeQuantity > 0 ? "+" : ""}
                      {e.changeQuantity}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{e.balanceAfter}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * BILLING TAB
 * ══════════════════════════════════════════════════════════ */
function BillingTab({ jc }: { jc: JobCardDetail }) {
  const laborTotal = jc.laborLines.reduce(
    (sum, l) => sum + parseFloat(l.lineTotal),
    0,
  );
  const partsTotal = jc.partLines.reduce(
    (sum, p) => sum + (p.issuedQty - p.returnedQty) * parseFloat(p.unitPrice),
    0,
  );
  const grandTotal = laborTotal + partsTotal;

  return (
    <div className="space-y-5">
      {/* Labor breakdown */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-2.5 bg-muted/30">
          <h4 className="text-xs font-semibold">Labor Charges</h4>
        </div>
        <div className="divide-y divide-border">
          {jc.laborLines.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">No labor lines</div>
          ) : (
            jc.laborLines.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div>
                  <span className="font-mono">{l.opCode}</span>
                  <span className="ml-1.5 text-muted-foreground">{l.opName}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    ({l.qtyHours}h × ${l.unitPrice})
                  </span>
                </div>
                <span className="font-mono font-medium">${l.lineTotal}</span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 text-xs font-semibold">
            <span>Labor Subtotal</span>
            <span className="font-mono">${laborTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Parts breakdown */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-2.5 bg-muted/30">
          <h4 className="text-xs font-semibold">Parts Charges (Net Used)</h4>
        </div>
        <div className="divide-y divide-border">
          {jc.partLines.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">No parts</div>
          ) : (
            jc.partLines
              .filter((p) => p.issuedQty - p.returnedQty > 0)
              .map((p) => {
                const netUsed = p.issuedQty - p.returnedQty;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-2.5 text-xs"
                  >
                    <div>
                      <span className="font-mono">{p.mnemonicSku}</span>
                      <span className="ml-1.5 text-muted-foreground">{p.productName}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        ({netUsed} × ${p.unitPrice})
                      </span>
                    </div>
                    <span className="font-mono font-medium">
                      ${(netUsed * parseFloat(p.unitPrice)).toFixed(2)}
                    </span>
                  </div>
                );
              })
          )}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 text-xs font-semibold">
            <span>Parts Subtotal</span>
            <span className="font-mono">${partsTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Grand Total */}
      <div className="rounded-lg border-2 border-foreground bg-foreground/5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Grand Total</span>
          <span className="text-xl font-bold font-mono">${grandTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * SHARED COMPONENTS
 * ══════════════════════════════════════════════════════════ */

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function MutationStatus({
  status,
  message,
}: {
  status: JCMutationStatus;
  message: string | null;
}) {
  if (status === "idle" || !message) return null;

  const styles: Record<string, string> = {
    submitting: "bg-muted text-muted-foreground",
    success: "bg-success/10 text-success",
    already_processed: "bg-blue-50 text-blue-700",
    contention_retry: "bg-warning/10 text-warning",
    needs_reconcile: "bg-destructive/10 text-destructive",
    error: "bg-destructive/10 text-destructive",
  };

  return (
    <div className={`rounded-md px-3 py-2 text-[11px] ${styles[status] ?? ""}`}>
      {message}
    </div>
  );
}

function ModalOverlay({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
