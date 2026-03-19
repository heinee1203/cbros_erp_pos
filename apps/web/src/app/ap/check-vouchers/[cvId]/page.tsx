"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  Send,
  Ban,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";

/* ─── Types ─── */

interface CVLine {
  id: string;
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: string;
  deduction: string;
  netAmount: string;
}

interface CheckVoucherDetail {
  id: string;
  cvNo: string;
  cvDate: string;
  supplierId: string;
  supplierName: string;
  supplierAddress: string | null;
  bankAccountId: string | null;
  bankName: string | null;
  accountNo: string | null;
  checkNo: string | null;
  checkDate: string | null;
  grossAmount: string;
  deductions: string;
  netAmount: string;
  status: string;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  lines: CVLine[];
}

/* ─── Status styling ─── */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  APPROVED: "bg-blue-100 text-blue-700",
  PRINTED: "bg-indigo-100 text-indigo-700",
  RELEASED: "bg-emerald-100 text-emerald-700",
  CLEARED: "bg-green-100 text-green-800",
  VOIDED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  PRINTED: "Printed",
  RELEASED: "Released",
  CLEARED: "Cleared",
  VOIDED: "Voided",
};

/* ─── numberToWords utility ─── */

function numberToWords(amount: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convert(n: number): string {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
    if (n < 1000)
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + convert(n % 100) : "")
      );
    if (n < 1000000)
      return (
        convert(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + convert(n % 1000) : "")
      );
    if (n < 1000000000)
      return (
        convert(Math.floor(n / 1000000)) +
        " Million" +
        (n % 1000000 ? " " + convert(n % 1000000) : "")
      );
    return String(n);
  }

  const whole = Math.floor(amount);
  const centavos = Math.round((amount - whole) * 100);
  const words = convert(whole) || "Zero";
  return `${words} Pesos and ${String(centavos).padStart(2, "0")}/100 Only`;
}

/* ─── PIN Modal ─── */

function PinModal({
  open,
  onClose,
  onConfirm,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => void;
  title: string;
}) {
  const [pin, setPin] = useState("");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Enter your PIN to confirm this action.
        </p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter PIN"
          className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && pin) onConfirm(pin);
          }}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(pin)}
            disabled={!pin}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  Check Voucher Detail Page                          */
/* ═══════════════════════════════════════════════════ */

export default function CheckVoucherDetailPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const cvId = params.cvId as string;

  const [cv, setCv] = useState<CheckVoucherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pinModal, setPinModal] = useState<{
    open: boolean;
    title: string;
    action: string;
  }>({ open: false, title: "", action: "" });

  const checkPrintRef = useRef<HTMLDivElement>(null);
  const cvPrintRef = useRef<HTMLDivElement>(null);

  const fetchCV = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CheckVoucherDetail }>(
        `/ap/check-vouchers/${cvId}`,
        { token, locationId }
      );
      setCv(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load check voucher");
    } finally {
      setLoading(false);
    }
  }, [token, locationId, cvId]);

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchCV();
    }
  }, [authLoading, token, locationId, fetchCV]);

  const performAction = async (action: string, pin?: string) => {
    if (!token || !locationId || !cv) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch(`/ap/check-vouchers/${cv.id}/${action}`, {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      await fetchCV();
    } catch (err: any) {
      setError(err.message || `Failed to ${action}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = () => {
    setPinModal({ open: true, title: "Approve Check Voucher", action: "approve" });
  };

  const handlePinConfirm = (pin: string) => {
    setPinModal({ open: false, title: "", action: "" });
    performAction(pinModal.action, pin);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this check voucher? This cannot be undone.")) return;
    if (!token || !locationId || !cv) return;
    try {
      await apiFetch(`/ap/check-vouchers/${cv.id}`, {
        token,
        locationId,
        method: "DELETE",
      });
      router.push("/ap/check-vouchers");
    } catch (err: any) {
      setError(err.message || "Failed to delete");
    }
  };

  const handlePrintCheck = () => {
    const printContent = checkPrintRef.current;
    if (!printContent) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Print Check - ${cv?.cvNo}</title>
          <style>
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            @page { size: 8in 3.5in; margin: 0; }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.print();
  };

  const handlePrintCV = () => {
    const printContent = cvPrintRef.current;
    if (!printContent) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Check Voucher - ${cv?.cvNo}</title>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #333; padding: 4px 8px; text-align: left; }
            th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .sig-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 10px; }
            @page { margin: 0.5in; }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.print();
  };

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/ap/check-vouchers"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!cv) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">
          Check voucher not found.
        </p>
        <Link
          href="/ap/check-vouchers"
          className="mt-2 text-sm text-primary hover:underline"
        >
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/ap/check-vouchers"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-semibold tracking-tight font-mono">
                {cv.cvNo}
              </h1>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  STATUS_COLORS[cv.status] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {STATUS_LABELS[cv.status] ?? cv.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {cv.supplierName} &bull; {fmtDate(cv.cvDate)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {cv.status === "DRAFT" && (
            <>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                Approve
              </button>
              <Link
                href={`/ap/check-vouchers/new?edit=${cv.id}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Edit3 size={14} />
                Edit
              </Link>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}

          {cv.status === "APPROVED" && (
            <>
              <button
                onClick={handlePrintCheck}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Printer size={14} />
                Print Check
              </button>
              <button
                onClick={handlePrintCV}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Printer size={14} />
                Print CV
              </button>
              <button
                onClick={() => performAction("mark-printed")}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                Mark Printed
              </button>
            </>
          )}

          {cv.status === "PRINTED" && (
            <button
              onClick={() => performAction("release")}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send size={14} />
              Release
            </button>
          )}

          {cv.status === "RELEASED" && (
            <>
              <button
                onClick={() => performAction("clear")}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                Clear
              </button>
              <button
                onClick={() => {
                  if (confirm("Void this check voucher?"))
                    performAction("void");
                }}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Ban size={14} />
                Void
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* CV Info Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[10px] font-medium uppercase text-muted-foreground">
            Check #
          </div>
          <div className="mt-0.5 font-mono text-sm font-semibold">
            {cv.checkNo || "\u2014"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[10px] font-medium uppercase text-muted-foreground">
            Bank
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {cv.bankName || "\u2014"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[10px] font-medium uppercase text-muted-foreground">
            Check Date
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {cv.checkDate ? fmtDate(cv.checkDate) : "\u2014"}
          </div>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="text-[10px] font-medium uppercase text-muted-foreground">
            Net Amount
          </div>
          <div className="mt-0.5 text-lg font-bold tabular-nums">
            {fmtPeso(cv.netAmount)}
          </div>
        </div>
      </div>

      {/* Amount breakdown */}
      <div className="mb-4 rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Gross Amount</span>
          <span className="tabular-nums font-medium">
            {fmtPeso(cv.grossAmount)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Less: Deductions</span>
          <span className="tabular-nums font-medium text-red-600">
            ({fmtPeso(cv.deductions)})
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="font-bold">Net Amount</span>
          <span className="text-lg font-bold tabular-nums">
            {fmtPeso(cv.netAmount)}
          </span>
        </div>
        {cv.notes && (
          <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span className="font-medium">Notes:</span> {cv.notes}
          </div>
        )}
      </div>

      {/* Invoice Lines Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-2">
          <h3 className="text-[13px] font-semibold">Invoice Lines</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Invoice #
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Amount
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Deduction
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {cv.lines.map((line, i) => (
              <tr
                key={line.id}
                className={`border-b border-border ${
                  i % 2 === 0 ? "bg-background" : "bg-muted/10"
                }`}
              >
                <td className="px-3 py-2.5 font-mono text-[13px] font-medium">
                  {line.invoiceNo}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {fmtDate(line.invoiceDate)}
                </td>
                <td className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                  {fmtPeso(line.amount)}
                </td>
                <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-red-600">
                  {parseFloat(line.deduction) > 0
                    ? `(${fmtPeso(line.deduction)})`
                    : "\u2014"}
                </td>
                <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">
                  {fmtPeso(line.netAmount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40">
              <td
                colSpan={2}
                className="px-3 py-2.5 text-[13px] font-bold"
              >
                Total
              </td>
              <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums">
                {fmtPeso(cv.grossAmount)}
              </td>
              <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-red-600">
                {parseFloat(cv.deductions) > 0
                  ? `(${fmtPeso(cv.deductions)})`
                  : "\u2014"}
              </td>
              <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums">
                {fmtPeso(cv.netAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ═══════ PRINT LAYOUTS (hidden, used by print functions) ═══════ */}

      {/* Check Print Layout */}
      <div ref={checkPrintRef} className="hidden">
        <div
          style={{
            position: "relative",
            width: "8in",
            height: "3.5in",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "0.5in",
              left: "4in",
              fontSize: "12px",
            }}
          >
            {cv.checkDate ? fmtDate(cv.checkDate) : ""}
          </div>
          <div
            style={{
              position: "absolute",
              top: "1in",
              left: "0.5in",
              fontSize: "14px",
              fontWeight: "bold",
            }}
          >
            {cv.supplierName}
          </div>
          <div
            style={{
              position: "absolute",
              top: "1.5in",
              left: "5.5in",
              fontSize: "14px",
              fontWeight: "bold",
            }}
          >
            &#8369;
            {parseFloat(cv.netAmount).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div
            style={{
              position: "absolute",
              top: "1.5in",
              left: "0.5in",
              fontSize: "11px",
            }}
          >
            {numberToWords(parseFloat(cv.netAmount))}
          </div>
        </div>
      </div>

      {/* CV Print Layout */}
      <div ref={cvPrintRef} className="hidden">
        <div style={{ fontFamily: "Arial, sans-serif" }}>
          {/* Company Header */}
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <div
              style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "2px" }}
            >
              Apex Auto Parts
            </div>
            <div style={{ fontSize: "10px", color: "#666" }}>
              Automotive Parts &amp; Supplies
            </div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginTop: "12px",
                textDecoration: "underline",
              }}
            >
              CHECK VOUCHER
            </div>
          </div>

          {/* CV Info */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "12px",
              fontSize: "12px",
            }}
          >
            <div>
              <div>
                <strong>CV No:</strong> {cv.cvNo}
              </div>
              <div>
                <strong>Date:</strong> {fmtDate(cv.cvDate)}
              </div>
              <div>
                <strong>Pay To:</strong> {cv.supplierName}
              </div>
              {cv.supplierAddress && (
                <div>
                  <strong>Address:</strong> {cv.supplierAddress}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div>
                <strong>Check No:</strong> {cv.checkNo || "\u2014"}
              </div>
              <div>
                <strong>Bank:</strong> {cv.bankName || "\u2014"}
              </div>
              <div>
                <strong>Check Date:</strong>{" "}
                {cv.checkDate ? fmtDate(cv.checkDate) : "\u2014"}
              </div>
            </div>
          </div>

          {/* Invoice breakdown table */}
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th className="text-right" style={{ textAlign: "right" }}>
                  Amount
                </th>
                <th className="text-right" style={{ textAlign: "right" }}>
                  Deduction
                </th>
                <th className="text-right" style={{ textAlign: "right" }}>
                  Net Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {cv.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.invoiceNo}</td>
                  <td>{fmtDate(line.invoiceDate)}</td>
                  <td style={{ textAlign: "right" }}>
                    {fmtPeso(line.amount)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {fmtPeso(line.deduction)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>
                    {fmtPeso(line.netAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={2}
                  style={{ fontWeight: "bold" }}
                >
                  TOTAL
                </td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>
                  {fmtPeso(cv.grossAmount)}
                </td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>
                  {fmtPeso(cv.deductions)}
                </td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>
                  {fmtPeso(cv.netAmount)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Amount in words */}
          <div style={{ marginTop: "12px", fontSize: "11px" }}>
            <strong>Amount in Words:</strong>{" "}
            {numberToWords(parseFloat(cv.netAmount))}
          </div>

          {/* Signature lines */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "48px",
              paddingTop: "0",
            }}
          >
            <div style={{ width: "30%", textAlign: "center" }}>
              <div className="sig-line">Prepared By</div>
            </div>
            <div style={{ width: "30%", textAlign: "center" }}>
              <div className="sig-line">Checked By</div>
            </div>
            <div style={{ width: "30%", textAlign: "center" }}>
              <div className="sig-line">Approved By</div>
            </div>
          </div>

          {/* Received by */}
          <div style={{ marginTop: "32px" }}>
            <div style={{ width: "40%" }}>
              <div className="sig-line">Received By (Supplier)</div>
            </div>
          </div>
        </div>
      </div>

      {/* PIN Modal */}
      <PinModal
        open={pinModal.open}
        onClose={() => setPinModal({ open: false, title: "", action: "" })}
        onConfirm={handlePinConfirm}
        title={pinModal.title}
      />
    </div>
  );
}
