"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import type { DVDetail, DVRecord } from "./dv-types";
import { STATUS_COLORS, METHOD_LABELS } from "./dv-types";

interface VoucherDetailModalProps {
  open: boolean;
  dvId: string | null;
  token: string;
  locationId: string;
  onClose: () => void;
  onReprint: (dv: DVRecord) => void;
  onVoid: (dv: DVRecord) => void;
  onConfirm: (dv: DVRecord) => void;
}

/** Returns true if remarks is just the auto-generated SOA reference text */
function isAutoRemarks(remarks: string | null): boolean {
  if (!remarks) return true;
  return /^(DV for |Payment for )?(SUPP-SOA-)/i.test(remarks.trim());
}

/** Format SOA period — shows "—" if dates are missing or identical */
function formatPeriod(from: string | null | undefined, to: string | null | undefined): string {
  if (!from || !to) return "\u2014";
  const f = from.slice(0, 10);
  const t = to.slice(0, 10);
  if (f === t) return fmtDate(from);
  return `${fmtDate(from)} \u2013 ${fmtDate(to)}`;
}

export function VoucherDetailModal({
  open,
  dvId,
  token,
  locationId,
  onClose,
  onReprint,
  onVoid,
  onConfirm,
}: VoucherDetailModalProps) {
  const [detail, setDetail] = useState<DVDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !dvId) { setDetail(null); return; }
    setLoading(true);
    setError(null);
    apiFetch<DVDetail>(`/ap/disbursement-vouchers/${dvId}`, { token, locationId })
      .then(setDetail)
      .catch((err) => setError(err.message || "Failed to load voucher details"))
      .finally(() => setLoading(false));
  }, [open, dvId, token, locationId]);

  if (!open) return null;

  const soaRefs = detail?.soaRefs && detail.soaRefs.length > 0
    ? detail.soaRefs
    : detail?.soaNumber
      ? [{ soaId: detail.soaId ?? "", soaNumber: detail.soaNumber, allocatedAmount: detail.grossAmount, dateFrom: detail.soaDateFrom, dateTo: detail.soaDateTo }]
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {detail ? detail.dvNumber : "Voucher Detail"}
            </h2>
            {detail && (
              <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_COLORS[detail.status] ?? "bg-muted text-muted-foreground")}>
                {detail.status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        ) : detail ? (
          <div className="space-y-4 text-sm">
            {/* Info */}
            <div className="space-y-1">
              <div><span className="text-muted-foreground w-28 inline-block">Supplier:</span> <span className="font-medium">{detail.supplierName}</span></div>
              <div><span className="text-muted-foreground w-28 inline-block">Payment Date:</span> {fmtDate(detail.paymentDate)}</div>
              {detail.remarks && !isAutoRemarks(detail.remarks) && (
                <div><span className="text-muted-foreground w-28 inline-block">Remarks:</span> {detail.remarks}</div>
              )}
            </div>

            {/* SOA Breakdown Table */}
            {soaRefs.length > 0 && (
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">
                  SOA{soaRefs.length > 1 ? "s" : ""} ({soaRefs.length})
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-1.5 text-left">SOA #</th>
                        <th className="px-3 py-1.5 text-left">Period</th>
                        <th className="px-3 py-1.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {soaRefs.map((ref) => (
                        <tr key={ref.soaId} className="border-t border-border/40">
                          <td className="px-3 py-1.5 font-mono font-semibold">{ref.soaNumber.replace(/^SUPP-SOA-/, "")}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{formatPeriod(ref.dateFrom, ref.dateTo)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtPeso(ref.allocatedAmount)}</td>
                        </tr>
                      ))}
                      {soaRefs.length > 1 && (
                        <tr className="border-t border-border bg-muted/20 font-semibold">
                          <td className="px-3 py-1.5" colSpan={2}>Total</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtPeso(soaRefs.reduce((s, r) => s + r.allocatedAmount, 0))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Amounts */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 tabular-nums">
              <div className="flex justify-between"><span>Gross Amount</span><span className="font-medium">{fmtPeso(detail.grossAmount)}</span></div>
              {detail.deductions.length > 0 && (
                <>
                  <div className="mt-1 text-muted-foreground text-[12px]">Deductions:</div>
                  {detail.deductions.map((d) => (
                    <div key={d.id} className="flex justify-between text-red-600 text-[12px] pl-3">
                      <span>{d.description}{d.referenceNumber ? ` (${d.referenceNumber})` : ""}</span>
                      <span>({fmtPeso(d.amount)})</span>
                    </div>
                  ))}
                </>
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold">
                <span>Net Amount</span><span>{fmtPeso(detail.netAmount)}</span>
              </div>
            </div>

            {/* Payments */}
            {detail.payments.length > 0 && (
              <div>
                <div className="mb-1 text-[12px] font-medium text-muted-foreground">Payments</div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead><tr className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-1.5 text-left">Method</th>
                      <th className="px-3 py-1.5 text-right">Amount</th>
                      <th className="px-3 py-1.5 text-left">Reference</th>
                      <th className="px-3 py-1.5 text-left">Date</th>
                    </tr></thead>
                    <tbody>
                      {detail.payments.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-3 py-1.5">{METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtPeso(p.amount)}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{p.referenceNumber || p.bankName || "\u2014"}</td>
                          <td className="px-3 py-1.5">{p.transactionDate ? fmtDate(p.transactionDate) : "\u2014"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Void info */}
            {detail.status === "VOIDED" && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-[12px]">
                <div className="font-semibold text-red-700">Voided</div>
                {detail.voidReason && <div className="text-red-600 mt-0.5">{detail.voidReason}</div>}
                {detail.voidedAt && <div className="text-red-500 mt-0.5">{fmtDate(detail.voidedAt)}</div>}
              </div>
            )}

            {/* Timestamps */}
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div>Created: {fmtDate(detail.createdAt)}</div>
              {detail.printedAt && <div>Printed: {fmtDate(detail.printedAt)}</div>}
              {detail.confirmedAt && <div>Confirmed: {fmtDate(detail.confirmedAt)}</div>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              {detail.status !== "VOIDED" && (
                <button onClick={() => { onVoid(detail); onClose(); }}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Void</button>
              )}
              {(detail.status === "CONFIRMED" || detail.status === "PRINTED") && (
                <button onClick={() => { onReprint(detail); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  <span className="flex items-center gap-1"><Printer size={12} />Reprint</span>
                </button>
              )}
              {detail.status === "PRINTED" && (
                <button onClick={() => { onConfirm(detail); onClose(); }}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Confirm</button>
              )}
              <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">Close</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
