"use client";

import { useState, useEffect } from "react";
import { X, CreditCard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/app/auth-context";
import { fmtPeso, fmtDate } from "@/lib/format";

/* ─── Types ─── */

interface PaymentRecord {
  id: string;
  paymentNumber: string | null;
  recordedAt: string;
  amount: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  notes: string | null;
  batchNumber: string | null;
  traceNumber: string | null;
  cardType: string | null;
  paymentLines: any[] | null;
  customerId: string;
  customerName: string;
  customerCode: string;
  recordedByName: string | null;
  soaNumbers: string[];
}

interface Allocation {
  referenceNumber: string;
  chargeDate: string;
  chargeAmount: number;
  amount: number;
  soaNumber: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", CHECK: "Check", BANK_TRANSFER: "Bank Transfer", CREDIT_CARD: "Credit Card",
  GCASH: "GCash", MAYA: "Maya", QRPH: "QRPH", SPLIT: "Split", EWT: "EWT", OTHER: "Other",
};

/* ─── Component ─── */

interface Props {
  payment: PaymentRecord | null;
  onClose: () => void;
}

export function PaymentDetailDrawer({ payment, onClose }: Props) {
  const { token, locationId } = useAuth();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payment || !token || !locationId) {
      setAllocations([]);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<{ data: Allocation[] }>(
      `/customers/${payment.customerId}/transactions/${payment.id}/settled-invoices`,
      { token, locationId },
    )
      .then((res) => setAllocations(res.data || []))
      .catch((err) => setError(err.message || "Failed to load allocations"))
      .finally(() => setLoading(false));
  }, [payment?.id, payment?.customerId, token, locationId]);

  if (!payment) return null;

  const ewtLine = Array.isArray(payment.paymentLines)
    ? payment.paymentLines.find((l: any) => l.method === "EWT")
    : null;
  const nonEwtLines = Array.isArray(payment.paymentLines)
    ? payment.paymentLines.filter((l: any) => l.method !== "EWT")
    : [];
  const isSplit = payment.paymentMethod === "SPLIT";
  const ewtAmount = ewtLine ? parseFloat(ewtLine.amount) || 0
    : payment.paymentMethod === "EWT" ? parseFloat(payment.amount) || 0
    : 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-primary" />
            <h2 className="text-base font-semibold">
              {payment.paymentNumber || "Payment Detail"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* ── Payment summary ── */}
          <section className="space-y-2">
            <Row label="Date" value={fmtDate(payment.recordedAt)} />
            <Row label="Customer" value={payment.customerName} />
            <Row label="Code" value={payment.customerCode} />
            <Row label="Total Amount" value={fmtPeso(payment.amount)} bold />
            <Row
              label="Method"
              value={METHOD_LABELS[payment.paymentMethod ?? ""] ?? payment.paymentMethod ?? "\u2014"}
            />
            {payment.referenceNumber && (
              <Row label="Reference" value={payment.referenceNumber} mono />
            )}
            {payment.cardType && <Row label="Card Type" value={payment.cardType} />}
            {payment.batchNumber && <Row label="Batch #" value={payment.batchNumber} mono />}
            {payment.traceNumber && <Row label="Trace #" value={payment.traceNumber} mono />}
            {payment.recordedByName && <Row label="Recorded By" value={payment.recordedByName} />}
            {payment.notes && <Row label="Notes" value={payment.notes} />}
            {payment.soaNumbers.length > 0 && (
              <Row label="SOA" value={payment.soaNumbers.join(", ")} mono />
            )}
          </section>

          {/* ── EWT breakdown ── */}
          {ewtAmount > 0 && (
            <section>
              <SectionLabel>EWT Deduction</SectionLabel>
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
                <Row label="EWT Amount" value={fmtPeso(ewtAmount)} bold />
                {ewtLine?.rate && <Row label="Rate" value={`${ewtLine.rate}%`} />}
                {ewtLine?.bir2307 && <Row label="BIR 2307" value={ewtLine.bir2307} mono />}
                {ewtLine?.baseAmount && <Row label="Base Amount" value={fmtPeso(ewtLine.baseAmount)} />}
              </div>
            </section>
          )}

          {/* ── Split payment breakdown ── */}
          {isSplit && nonEwtLines.length > 0 && (
            <section>
              <SectionLabel>Payment Breakdown</SectionLabel>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Method</th>
                      <th className="px-3 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                      <th className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonEwtLines.map((l: any, i: number) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 text-xs">
                          <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {METHOD_LABELS[l.method] ?? l.method}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums font-medium">{fmtPeso(l.amount)}</td>
                        <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground">
                          {l.reference || l.checkNumber || l.bank || "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Allocation detail (settled invoices) ── */}
          <section>
            <SectionLabel>Invoice Allocations</SectionLabel>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="rounded-md border border-red-200 bg-red-50/50 p-3 text-center">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            ) : allocations.length === 0 ? (
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Unallocated payment — sits as customer credit until applied to an invoice.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</th>
                      <th className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SOA</th>
                      <th className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                      <th className="px-3 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Charge</th>
                      <th className="px-3 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a, i) => (
                      <tr key={i} className={cn("border-b border-border last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                        <td className="px-3 py-1.5 text-xs font-mono text-foreground">{a.referenceNumber}</td>
                        <td className="px-3 py-1.5 text-[11px] font-mono text-muted-foreground">{a.soaNumber || "\u2014"}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{fmtDate(a.chargeDate)}</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{fmtPeso(a.chargeAmount)}</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums font-semibold">{fmtPeso(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {allocations.length > 1 && (
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30 font-semibold">
                        <td colSpan={4} className="px-3 py-1.5 text-[11px] text-muted-foreground">Total Applied</td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                          {fmtPeso(allocations.reduce((s, a) => s + a.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/* ─── Sub-components ─── */

function Row({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
      <span className={cn(
        "text-[12px] text-right break-all",
        bold && "font-semibold text-foreground",
        mono && "font-mono",
        !bold && !mono && "text-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
