"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Package,
  AlertTriangle,
  Printer,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDateTime, fmtTime } from "@/lib/format";

interface ZReadingData {
  shiftId: string;
  cashierName: string;
  locationName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  salesSummary: {
    grossSales: string;
    refundsTotal: string;
    netSales: string;
    transactionCount: number;
    avgTicket: string;
    voidCount: number;
  };
  paymentBreakdown: Array<{
    method: string;
    total: string;
    count: number;
  }>;
  cashReconciliation: {
    expectedCash: string;
    actualCash: string | null;
    variance: string | null;
  };
  topItems: Array<{
    productName: string;
    mnemonicSku: string;
    unitsSold: number;
    totalRevenue: string;
  }>;
  accountability: {
    voids: Array<{
      saleNo: string;
      amount: string;
      voidedAt: string | null;
      voidedBy: string | null;
    }>;
    refunds: Array<{
      saleNo: string;
      amount: string;
      refundedAt: string | null;
      refundedBy: string | null;
      reason: string | null;
    }>;
  };
}

interface ShiftDetail {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  actualCash: string | null;
  cashVariance: string | null;
  notes: string | null;
  timezone: string;
  cashierName: string;
  locationName: string;
  zReadingSnapshot: ZReadingData | null;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CLOSED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  FORCE_CLOSED: "bg-red-500/10 text-red-500 border-red-500/20",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  QRPH: "QRPH",
  GCASH: "GCash",
  MAYA: "Maya",
  BANK_TRANSFER: "Bank Transfer",
  ACCOUNT: "Charge/Account",
  EFT: "EFT",
  CARD: "Card",
  OTHER: "Other",
};

/** Null-safe wrappers for shared formatters */
function fmtDateTimeOrDash(dateStr: string | null): string {
  return dateStr ? fmtDateTime(dateStr) : "\u2014";
}

function fmtTimeOrDash(dateStr: string | null): string {
  return dateStr ? fmtTime(dateStr) : "\u2014";
}

export default function ShiftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const shiftId = params.shiftId as string;
  const { token, locationId, user } = useAuth();
  const queryClient = useQueryClient();

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  // Fetch shift detail
  const { data: shiftRes, isLoading: shiftLoading } = useQuery({
    queryKey: ["shifts", "detail", shiftId],
    queryFn: () =>
      apiFetch<{ data: ShiftDetail }>(`/shifts/${shiftId}`, {
        token,
        locationId,
      }),
    enabled: !!shiftId && !!token,
  });

  // Fetch Z-reading data
  const { data: zRes, isLoading: zLoading } = useQuery({
    queryKey: ["shifts", "z-reading", shiftId],
    queryFn: () =>
      apiFetch<{ data: ZReadingData }>(`/shifts/${shiftId}/z-reading`, {
        token,
        locationId,
      }),
    enabled: !!shiftId && !!token,
  });

  // Force close mutation
  const forceCloseMutation = useMutation({
    mutationFn: (pinValue: string) =>
      apiFetch(`/shifts/${shiftId}/force-close`, {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ pin: pinValue }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setPinModalOpen(false);
      setPin("");
    },
    onError: (err: any) => {
      setPinError(err.message || "Failed to force-close shift");
    },
  });

  const shift = shiftRes?.data;
  const zReading = zRes?.data;
  const isLoading = shiftLoading || zLoading;

  if (isLoading || !shift) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isOpen = shift.status === "OPEN";
  const canForceClose =
    isOpen && (user?.role === "ADMIN" || user?.role === "MANAGER");

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/sales/shifts")}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent/40"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">
              Shift Detail
            </h1>
            <span
              className={cn(
                "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase",
                STATUS_STYLES[shift.status] ??
                  "bg-muted text-muted-foreground border-border",
              )}
            >
              {shift.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {shift.cashierName} at {shift.locationName}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[13px] font-medium hover:bg-accent/40"
          >
            <Printer size={13} />
            Print
          </button>
          {canForceClose && (
            <button
              onClick={() => setPinModalOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-red-500/10 px-3 text-[13px] font-medium text-red-500 hover:bg-red-500/20"
            >
              <XCircle size={13} />
              Force Close
            </button>
          )}
        </div>
      </div>

      {/* Shift meta */}
      <div className="flex gap-5 text-[13px]">
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-muted-foreground" />
          <span className="text-muted-foreground">Opened:</span>
          <span className="font-medium">{fmtDateTime(shift.openedAt)}</span>
        </div>
        {shift.closedAt && (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-muted-foreground" />
            <span className="text-muted-foreground">Closed:</span>
            <span className="font-medium">{fmtDateTime(shift.closedAt)}</span>
          </div>
        )}
      </div>

      {zReading && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* 1. Sales Summary */}
          <Section title="Sales Summary" icon={DollarSign}>
            <Row label="Gross Sales" value={fmtPeso(zReading.salesSummary.grossSales)} />
            <Row
              label="Refunds"
              value={`-${fmtPeso(zReading.salesSummary.refundsTotal)}`}
              className="text-red-500"
            />
            <Divider />
            <Row
              label="Net Sales"
              value={fmtPeso(zReading.salesSummary.netSales)}
              bold
            />
            <Divider />
            <Row
              label="Transactions"
              value={String(zReading.salesSummary.transactionCount)}
            />
            <Row
              label="Avg Ticket"
              value={fmtPeso(zReading.salesSummary.avgTicket)}
            />
            <Row
              label="Voids"
              value={String(zReading.salesSummary.voidCount)}
              className={
                zReading.salesSummary.voidCount > 0 ? "text-red-500" : ""
              }
            />
          </Section>

          {/* 2. Payment Breakdown */}
          <Section title="Payment Breakdown" icon={DollarSign}>
            {zReading.paymentBreakdown.length === 0 ? (
              <p className="text-[13px] italic text-muted-foreground">
                No payments recorded
              </p>
            ) : (
              zReading.paymentBreakdown.map((p, i) => (
                <Row
                  key={i}
                  label={`${METHOD_LABELS[p.method] ?? p.method} (${p.count})`}
                  value={fmtPeso(p.total)}
                />
              ))
            )}
          </Section>

          {/* 3. Cash Reconciliation */}
          <Section title="Cash Reconciliation" icon={DollarSign}>
            <Row
              label="Opening Float"
              value={fmtPeso(zReading.openingFloat)}
            />
            <Row
              label="Expected Cash"
              value={fmtPeso(zReading.cashReconciliation.expectedCash)}
              bold
            />
            {shift.actualCash !== null && (
              <>
                <Divider />
                <Row
                  label="Actual Cash"
                  value={fmtPeso(shift.actualCash)}
                  bold
                />
                {shift.cashVariance !== null && (
                  <Row
                    label="Variance"
                    value={`${parseFloat(shift.cashVariance) >= 0 ? "+" : ""}${fmtPeso(shift.cashVariance)}`}
                    className={cn(
                      Math.abs(parseFloat(shift.cashVariance)) < 1
                        ? "text-emerald-500"
                        : Math.abs(parseFloat(shift.cashVariance)) < 50
                          ? "text-amber-500"
                          : "text-red-500",
                    )}
                    bold
                  />
                )}
              </>
            )}
          </Section>

          {/* 4. Top Items */}
          <Section title="Top 5 Items" icon={Package}>
            {zReading.topItems.length === 0 ? (
              <p className="text-[13px] italic text-muted-foreground">
                No items sold
              </p>
            ) : (
              zReading.topItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-[11px] font-semibold text-muted-foreground">
                      {i + 1}.
                    </span>
                    <div>
                      <p className="text-[13px] font-medium">{item.productName}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {item.mnemonicSku}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] text-muted-foreground">
                      {item.unitsSold} sold
                    </p>
                    <p className="text-[13px] font-mono font-medium">
                      {fmtPeso(item.totalRevenue)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Section>

          {/* 5. Accountability */}
          <div className="lg:col-span-2">
            <Section title="Accountability" icon={AlertTriangle}>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Voids */}
                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Voids ({zReading.accountability.voids.length})
                  </h4>
                  {zReading.accountability.voids.length === 0 ? (
                    <p className="mt-2 text-[13px] italic text-muted-foreground">
                      None
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {zReading.accountability.voids.map((v, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-md bg-red-500/[0.04] px-3 py-2"
                        >
                          <div>
                            <p className="text-[13px] font-mono font-medium">
                              {v.saleNo}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {fmtTimeOrDash(v.voidedAt)}{" "}
                              {v.voidedBy && `by ${v.voidedBy}`}
                            </p>
                          </div>
                          <span className="text-[13px] font-mono font-medium text-red-500">
                            {fmtPeso(v.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Refunds */}
                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Refunds ({zReading.accountability.refunds.length})
                  </h4>
                  {zReading.accountability.refunds.length === 0 ? (
                    <p className="mt-2 text-[13px] italic text-muted-foreground">
                      None
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {zReading.accountability.refunds.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-md bg-red-500/[0.04] px-3 py-2"
                        >
                          <div>
                            <p className="text-[13px] font-mono font-medium">
                              {r.saleNo}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {fmtTimeOrDash(r.refundedAt)}{" "}
                              {r.refundedBy && `by ${r.refundedBy}`}
                            </p>
                            {r.reason && (
                              <p className="text-[11px] italic text-muted-foreground">
                                {r.reason}
                              </p>
                            )}
                          </div>
                          <span className="text-[13px] font-mono font-medium text-red-500">
                            {fmtPeso(r.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          </div>
        </div>
      )}

      {/* Notes */}
      {shift.notes && (
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </h3>
          <p className="mt-2 text-[13px] text-foreground">{shift.notes}</p>
        </div>
      )}

      {/* Force Close PIN Modal */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[360px] rounded-xl border border-border bg-background p-6 shadow-xl">
            <h3 className="text-[15px] font-semibold">Force Close Shift</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Enter your manager PIN to force-close this shift.
            </p>

            <input
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setPinError("");
              }}
              placeholder="Enter PIN"
              className="mt-4 w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-center text-lg font-mono tracking-widest"
              autoFocus
              maxLength={6}
            />

            {pinError && (
              <p className="mt-2 text-[13px] text-red-500">{pinError}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setPinModalOpen(false);
                  setPin("");
                  setPinError("");
                }}
                className="flex-1 rounded-md border border-border py-2 text-[13px] font-medium hover:bg-accent/40"
              >
                Cancel
              </button>
              <button
                onClick={() => forceCloseMutation.mutate(pin)}
                disabled={!pin || forceCloseMutation.isPending}
                className="flex-1 rounded-md bg-red-500 py-2 text-[13px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {forceCloseMutation.isPending
                  ? "Closing..."
                  : "Force Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable components ──

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" />
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  className,
}: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={cn(
          "text-[13px] text-muted-foreground",
          bold && "font-semibold text-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-[13px] font-mono",
          bold ? "font-semibold" : "font-medium",
          className,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 h-px bg-border" />;
}
