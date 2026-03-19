"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, FileText } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";

/* ─── Types ─── */

interface Supplier {
  id: string;
  name: string;
}

interface OpenInvoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  balance: string;
  status: string;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}

interface InvoiceLine {
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: string;
  payAmount: string;
  deduction: string;
}

/* ═══════════════════════════════════════════════════ */
/*  Create Check Voucher Page                          */
/* ═══════════════════════════════════════════════════ */

export default function NewCheckVoucherPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedInvoiceId = searchParams.get("invoiceId");

  // Step state
  const [step, setStep] = useState(1);

  // Step 1: supplier + invoice selection
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  // Step 2: check details
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [checkNo, setCheckNo] = useState("");
  const [checkDate, setCheckDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch suppliers
  useEffect(() => {
    if (!authLoading && token && locationId) {
      apiFetch<{ data: Supplier[] }>("/procurement/suppliers", {
        token,
        locationId,
      })
        .then((res) => setSuppliers(res.data))
        .catch(() => {});

      apiFetch<{ data: BankAccount[] }>("/ap/bank-accounts", {
        token,
        locationId,
      })
        .then((res) => setBankAccounts(res.data))
        .catch(() => {});
    }
  }, [authLoading, token, locationId]);

  // Fetch open invoices for selected supplier
  const fetchInvoices = useCallback(async () => {
    if (!token || !locationId || !selectedSupplier) return;
    setLoadingInvoices(true);
    try {
      const res = await apiFetch<{ data: OpenInvoice[] }>(
        `/ap/invoices?supplierId=${selectedSupplier}&status=OPEN&status=PARTIALLY_PAID`,
        { token, locationId }
      );
      setOpenInvoices(res.data);

      // If preselected invoice, auto-add it
      if (preselectedInvoiceId) {
        const inv = res.data.find((i) => i.id === preselectedInvoiceId);
        if (inv) {
          setLines([
            {
              invoiceId: inv.id,
              invoiceNo: inv.invoiceNo,
              invoiceDate: inv.invoiceDate,
              amount: inv.balance,
              payAmount: inv.balance,
              deduction: "0",
            },
          ]);
        }
      }
    } catch {}
    setLoadingInvoices(false);
  }, [token, locationId, selectedSupplier, preselectedInvoiceId]);

  useEffect(() => {
    if (selectedSupplier) {
      fetchInvoices();
    } else {
      setOpenInvoices([]);
      setLines([]);
    }
  }, [selectedSupplier, fetchInvoices]);

  // Handle pre-selected invoice — find its supplier
  useEffect(() => {
    if (preselectedInvoiceId && token && locationId && !selectedSupplier) {
      apiFetch<{ data: { supplierId: string } }>(
        `/ap/invoices/${preselectedInvoiceId}`,
        { token, locationId }
      )
        .then((res) => {
          if (res.data?.supplierId) {
            setSelectedSupplier(res.data.supplierId);
          }
        })
        .catch(() => {});
    }
  }, [preselectedInvoiceId, token, locationId, selectedSupplier]);

  // Toggle invoice selection
  const toggleInvoice = (inv: OpenInvoice) => {
    setLines((prev) => {
      const exists = prev.find((l) => l.invoiceId === inv.id);
      if (exists) {
        return prev.filter((l) => l.invoiceId !== inv.id);
      }
      return [
        ...prev,
        {
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          amount: inv.balance,
          payAmount: inv.balance,
          deduction: "0",
        },
      ];
    });
  };

  const updateLine = (
    invoiceId: string,
    field: "payAmount" | "deduction",
    value: string
  ) => {
    setLines((prev) =>
      prev.map((l) => (l.invoiceId === invoiceId ? { ...l, [field]: value } : l))
    );
  };

  // Totals
  const totals = useMemo(() => {
    return lines.reduce(
      (acc, l) => ({
        gross: acc.gross + parseFloat(l.payAmount || "0"),
        deductions: acc.deductions + parseFloat(l.deduction || "0"),
        net:
          acc.net +
          parseFloat(l.payAmount || "0") -
          parseFloat(l.deduction || "0"),
      }),
      { gross: 0, deductions: 0, net: 0 }
    );
  }, [lines]);

  // Submit
  const handleSubmit = async (approve: boolean) => {
    if (lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        supplierId: selectedSupplier,
        bankAccountId: bankAccountId || undefined,
        checkNo: checkNo || undefined,
        checkDate,
        notes: notes || undefined,
        approve,
        lines: lines.map((l) => ({
          invoiceId: l.invoiceId,
          payAmount: l.payAmount,
          deduction: l.deduction,
        })),
      };
      await apiFetch("/ap/check-vouchers", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push("/ap/check-vouchers");
    } catch (err: any) {
      setError(err.message || "Failed to create check voucher");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/ap/check-vouchers"
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">
            New Check Voucher
          </h1>
          <p className="text-xs text-muted-foreground">
            Step {step} of 2 —{" "}
            {step === 1 ? "Select invoices to pay" : "Enter check details"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            step >= 1
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {step > 1 ? <Check size={14} /> : "1"}
        </div>
        <div
          className={`h-0.5 flex-1 rounded ${
            step > 1 ? "bg-primary" : "bg-muted"
          }`}
        />
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            step >= 2
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          2
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ════════ STEP 1: Select invoices ════════ */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Supplier select */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Supplier *
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Open invoices */}
          {selectedSupplier && (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="border-b border-border bg-muted/40 px-4 py-2">
                <h3 className="text-[13px] font-semibold">
                  Open Invoices
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Select invoices to include in this check voucher
                </p>
              </div>

              {loadingInvoices ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded bg-muted"
                    />
                  ))}
                </div>
              ) : openInvoices.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No open invoices for this supplier.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {/* Header */}
                  <div className="flex items-center gap-3 bg-muted/20 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <div className="w-6" />
                    <div className="w-32">Invoice #</div>
                    <div className="w-24">Date</div>
                    <div className="w-24">Due Date</div>
                    <div className="w-28 text-right">Balance</div>
                    <div className="flex-1 text-right">Pay Amount</div>
                    <div className="w-28 text-right">Deduction</div>
                  </div>

                  {openInvoices.map((inv) => {
                    const selected = lines.find(
                      (l) => l.invoiceId === inv.id
                    );
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
                      >
                        <div className="w-6">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => toggleInvoice(inv)}
                            className="rounded border-border"
                          />
                        </div>
                        <div className="w-32 font-mono text-[13px] font-medium">
                          {inv.invoiceNo}
                        </div>
                        <div className="w-24 text-xs text-muted-foreground">
                          {fmtDate(inv.invoiceDate)}
                        </div>
                        <div className="w-24 text-xs text-muted-foreground">
                          {fmtDate(inv.dueDate)}
                        </div>
                        <div className="w-28 text-right text-[13px] tabular-nums font-medium">
                          {fmtPeso(inv.balance)}
                        </div>
                        <div className="flex-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={inv.balance}
                            value={selected?.payAmount ?? ""}
                            onChange={(e) =>
                              updateLine(
                                inv.id,
                                "payAmount",
                                e.target.value
                              )
                            }
                            disabled={!selected}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary disabled:opacity-40"
                          />
                        </div>
                        <div className="w-28">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={selected?.deduction ?? ""}
                            onChange={(e) =>
                              updateLine(
                                inv.id,
                                "deduction",
                                e.target.value
                              )
                            }
                            disabled={!selected}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary disabled:opacity-40"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Totals */}
              {lines.length > 0 && (
                <div className="border-t border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center justify-end gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">Gross: </span>
                      <span className="font-semibold tabular-nums">
                        {fmtPeso(totals.gross)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Deductions:{" "}
                      </span>
                      <span className="font-semibold tabular-nums text-red-600">
                        {fmtPeso(totals.deductions)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Net: </span>
                      <span className="text-lg font-bold tabular-nums">
                        {fmtPeso(totals.net)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Next button */}
          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={lines.length === 0}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Next: Check Details
            </button>
          </div>
        </div>
      )}

      {/* ════════ STEP 2: Check details ════════ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Summary of selected invoices */}
          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="mb-2 text-[13px] font-semibold">
              Selected Invoices ({lines.length})
            </h3>
            <div className="space-y-1">
              {lines.map((l) => (
                <div
                  key={l.invoiceId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono text-muted-foreground">
                    {l.invoiceNo}
                  </span>
                  <span className="tabular-nums">
                    {fmtPeso(
                      parseFloat(l.payAmount || "0") -
                        parseFloat(l.deduction || "0")
                    )}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-1 text-sm font-bold">
                <span>Total Net</span>
                <span className="tabular-nums">{fmtPeso(totals.net)}</span>
              </div>
            </div>
          </div>

          {/* Check details form */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Bank Account
              </label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select bank account...</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} — {b.accountNo}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Check Number
                </label>
                <input
                  type="text"
                  value={checkNo}
                  onChange={(e) => setCheckNo(e.target.value)}
                  placeholder="e.g. 00012345"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Check Date
                </label>
                <input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Use a future date for post-dated checks (PDC)
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => handleSubmit(false)}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create as Draft"}
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
