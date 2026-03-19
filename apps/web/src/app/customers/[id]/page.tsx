"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  FileText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useCustomer,
  useCustomerTransactions,
  useSOA,
  type CustomerTransaction,
} from "@/hooks/use-customers-query";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPeso(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `\u20B1${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TYPE_BADGE: Record<string, string> = {
  CHARGE: "bg-blue-100 text-blue-800",
  PAYMENT: "bg-emerald-100 text-emerald-800",
  CREDIT_NOTE: "bg-amber-100 text-amber-800",
  ADJUSTMENT: "bg-gray-100 text-gray-800",
};

const CUSTOMER_TYPE_BADGE: Record<string, string> = {
  INDIVIDUAL: "bg-slate-500/10 text-slate-600",
  SHOP: "bg-blue-500/10 text-blue-600",
  FLEET: "bg-purple-500/10 text-purple-600",
  WHOLESALE: "bg-amber-500/10 text-amber-600",
};

const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CHECK",
  "GCASH",
  "MAYA",
  "QRPH",
  "OTHER",
] as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Debit / Credit helpers for transaction rows                       */
/* ------------------------------------------------------------------ */

function isDebit(tx: CustomerTransaction): boolean {
  if (tx.type === "CHARGE") return true;
  if (tx.type === "ADJUSTMENT" && parseFloat(tx.amount) > 0) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function CustomerDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { token, locationId, user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  /* ── Data ── */
  const customerQuery = useCustomer(token, locationId, id);
  const customer = customerQuery.data?.customer;
  const recentTransactions = customerQuery.data?.recentTransactions;

  /* ── Tabs ── */
  const [activeTab, setActiveTab] = useState<"transactions" | "sales" | "statement">("transactions");

  /* ── Transaction filters ── */
  const [txTypeFilter, setTxTypeFilter] = useState("");
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txCursor, setTxCursor] = useState<string | undefined>();

  const transactionsQuery = useCustomerTransactions(token, locationId, id, {
    type: txTypeFilter || undefined,
    from: txFrom || undefined,
    to: txTo || undefined,
    cursor: txCursor,
    limit: 30,
  });

  /* ── SOA state ── */
  const [soaFrom, setSoaFrom] = useState(firstOfMonthISO());
  const [soaTo, setSoaTo] = useState(todayISO());
  const soaQuery = useSOA(token, locationId, id, soaFrom, soaTo);

  /* ── Payment modal ── */
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>("CASH");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payError, setPayError] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  const openPaymentModal = () => {
    setPayAmount(customer ? customer.currentBalance : "0");
    setPayMethod("CASH");
    setPayRef("");
    setPayNotes("");
    setPayError("");
    setShowPaymentModal(true);
  };

  const handlePayment = async () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) {
      setPayError("Amount must be greater than 0");
      return;
    }
    if (customer && amt > parseFloat(customer.currentBalance)) {
      setPayError("Amount cannot exceed the current balance");
      return;
    }
    setPayLoading(true);
    setPayError("");
    try {
      await apiFetch(`/customers/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: payAmount,
          paymentMethod: payMethod,
          referenceNumber: payRef.trim() || undefined,
          notes: payNotes.trim() || undefined,
        }),
        token,
        locationId,
      });
      setShowPaymentModal(false);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["customers", "soa", id] });
    } catch (err: any) {
      setPayError(err.message || "Failed to record payment");
    } finally {
      setPayLoading(false);
    }
  };

  /* ── Loading skeleton ── */
  if (customerQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-5xl flex-col p-4">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mb-6 h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  /* ── 404 state ── */
  if (!customerQuery.isLoading && !customer) {
    return (
      <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">Customer not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The customer you are looking for does not exist or has been removed.
          </p>
          <button
            onClick={() => router.push("/customers")}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Back to Customers
          </button>
        </div>
      </div>
    );
  }

  const balance = parseFloat(customer!.currentBalance);
  const creditLimit = parseFloat(customer!.creditLimit);

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col p-4">
      {/* ── Header ── */}
      <button
        onClick={() => router.push("/customers")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft size={14} />
        Back to Customers
      </button>

      <div className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-foreground">{customer!.name}</h1>
          <span
            className={cn(
              "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
              CUSTOMER_TYPE_BADGE[customer!.customerType] ?? "bg-muted text-muted-foreground",
            )}
          >
            {customer!.customerType}
          </span>
          <span
            className={cn(
              "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
              customer!.isActive
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700",
            )}
          >
            {customer!.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Contact info */}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground">
          {customer!.phone && (
            <span className="flex items-center gap-1">
              <Phone size={13} /> {customer!.phone}
            </span>
          )}
          {customer!.email && (
            <span className="flex items-center gap-1">
              <Mail size={13} /> {customer!.email}
            </span>
          )}
          {customer!.address && (
            <span className="flex items-center gap-1">
              <MapPin size={13} /> {customer!.address}
            </span>
          )}
          {customer!.tin && (
            <span className="flex items-center gap-1">
              <FileText size={13} /> TIN: {customer!.tin}
            </span>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Current Balance */}
        <div
          className={cn(
            "rounded-xl border p-5 shadow-sm",
            balance === 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50",
          )}
        >
          <div className="text-[12px] font-medium text-muted-foreground">Current Balance</div>
          <div
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums",
              balance === 0 ? "text-emerald-600" : "text-red-600",
            )}
          >
            {formatPeso(customer!.currentBalance)}
          </div>
        </div>

        {/* Credit Limit */}
        <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="text-[12px] font-medium text-muted-foreground">Credit Limit</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {creditLimit === 0 ? "Unlimited" : formatPeso(customer!.creditLimit)}
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            Payment terms: {customer!.paymentTermsDays} days
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="mb-6 flex items-center gap-2">
        {isManager && balance > 0 && (
          <button
            onClick={openPaymentModal}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <CreditCard size={14} />
            Record Payment
          </button>
        )}
        <button
          onClick={() => router.push("/customers")}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Edit
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        {(
          [
            { key: "transactions", label: "Transactions" },
            { key: "sales", label: "Sales History" },
            { key: "statement", label: "Statement of Account" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}

      {/* Transactions tab */}
      {activeTab === "transactions" && (
        <div>
          {/* Filters */}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Type</label>
              <select
                value={txTypeFilter}
                onChange={(e) => { setTxTypeFilter(e.target.value); setTxCursor(undefined); }}
                className="block w-40 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="CHARGE">Charge</option>
                <option value="PAYMENT">Payment</option>
                <option value="CREDIT_NOTE">Credit Note</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={txFrom}
                onChange={(e) => { setTxFrom(e.target.value); setTxCursor(undefined); }}
                className="block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={txTo}
                onChange={(e) => { setTxTo(e.target.value); setTxCursor(undefined); }}
                className="block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Transaction table */}
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <div className="w-28">Date</div>
              <div className="w-28">Type</div>
              <div className="flex-1">Description</div>
              <div className="w-28 text-right">Debit</div>
              <div className="w-28 text-right">Credit</div>
              <div className="w-32 text-right">Balance After</div>
            </div>

            {transactionsQuery.isLoading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : !transactionsQuery.data?.data?.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No transactions found.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {transactionsQuery.data.data.map((tx) => (
                  <div key={tx.id} className="flex items-center px-4 py-2.5 text-[13px]">
                    <div className="w-28 text-muted-foreground">{formatDate(tx.recordedAt)}</div>
                    <div className="w-28">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
                          TYPE_BADGE[tx.type] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {tx.type}
                      </span>
                    </div>
                    <div className="flex-1 truncate text-foreground">
                      {tx.referenceNumber || tx.notes || "\u2014"}
                    </div>
                    <div className="w-28 text-right tabular-nums text-foreground">
                      {isDebit(tx) ? formatPeso(Math.abs(parseFloat(tx.amount))) : ""}
                    </div>
                    <div className="w-28 text-right tabular-nums text-foreground">
                      {!isDebit(tx) ? formatPeso(Math.abs(parseFloat(tx.amount))) : ""}
                    </div>
                    <div className="w-32 text-right tabular-nums font-medium text-foreground">
                      {formatPeso(tx.balanceAfter)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {transactionsQuery.data?.hasMore && (
              <div className="border-t border-border px-4 py-2 text-center">
                <button
                  onClick={() => {
                    const items = transactionsQuery.data?.data;
                    const last = items?.[items.length - 1];
                    if (last) setTxCursor(last.id);
                  }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales History tab */}
      {activeTab === "sales" && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Sales history filtered by this customer — coming soon.
          </p>
        </div>
      )}

      {/* Statement of Account tab */}
      {activeTab === "statement" && (
        <div>
          {/* Date range */}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={soaFrom}
                onChange={(e) => setSoaFrom(e.target.value)}
                className="block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={soaTo}
                onChange={(e) => setSoaTo(e.target.value)}
                className="block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              Print Statement
            </button>
          </div>

          {/* SOA table */}
          <div className="print-soa-container overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            {/* SOA header for print */}
            <div className="hidden print:block p-4 border-b border-border">
              <h2 className="text-lg font-bold">Statement of Account</h2>
              <p className="text-sm text-muted-foreground">
                {customer!.name} &mdash; {soaFrom} to {soaTo}
              </p>
            </div>

            <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <div className="w-28">Date</div>
              <div className="flex-1">Description</div>
              <div className="w-28 text-right">Debit</div>
              <div className="w-28 text-right">Credit</div>
              <div className="w-32 text-right">Balance</div>
            </div>

            {soaQuery.isLoading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : soaQuery.data ? (
              <div className="divide-y divide-border">
                {/* Opening Balance */}
                <div className="flex items-center px-4 py-2.5 text-[13px] bg-muted/20">
                  <div className="w-28 text-muted-foreground">{soaFrom}</div>
                  <div className="flex-1 font-medium text-foreground">Opening Balance</div>
                  <div className="w-28" />
                  <div className="w-28" />
                  <div className="w-32 text-right tabular-nums font-medium text-foreground">
                    {formatPeso(soaQuery.data.openingBalance)}
                  </div>
                </div>

                {/* Transaction rows */}
                {soaQuery.data.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center px-4 py-2.5 text-[13px]">
                    <div className="w-28 text-muted-foreground">{formatDate(tx.recordedAt)}</div>
                    <div className="flex-1 truncate text-foreground">
                      {tx.referenceNumber || tx.notes || tx.type}
                    </div>
                    <div className="w-28 text-right tabular-nums text-foreground">
                      {isDebit(tx) ? formatPeso(Math.abs(parseFloat(tx.amount))) : ""}
                    </div>
                    <div className="w-28 text-right tabular-nums text-foreground">
                      {!isDebit(tx) ? formatPeso(Math.abs(parseFloat(tx.amount))) : ""}
                    </div>
                    <div className="w-32 text-right tabular-nums text-foreground">
                      {formatPeso(tx.balanceAfter)}
                    </div>
                  </div>
                ))}

                {/* Closing Balance */}
                <div className="flex items-center px-4 py-2.5 text-[13px] bg-muted/20">
                  <div className="w-28 text-muted-foreground">{soaTo}</div>
                  <div className="flex-1 font-bold text-foreground">Closing Balance</div>
                  <div className="w-28" />
                  <div className="w-28" />
                  <div className="w-32 text-right tabular-nums font-bold text-foreground">
                    {formatPeso(soaQuery.data.closingBalance)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No statement data available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Payment Modal ── */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Record Payment</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="rounded p-1 hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>

            {payError && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">
                {payError}
              </div>
            )}

            <div className="space-y-3">
              {/* Amount */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Amount ({"\u20B1"})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={customer!.currentBalance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  autoFocus
                />
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Outstanding: {formatPeso(customer!.currentBalance)}
                </p>
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Number */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reference Number</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Check #, GCash ref, etc."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={payLoading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {payLoading ? "Processing..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body > *:not(.print-soa-container) {
            display: none !important;
          }
          .print-soa-container {
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
