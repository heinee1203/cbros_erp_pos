"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Plus, X, Search, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { buildPaymentReceiptHtml } from "@/lib/payment-receipt-html";

function fmtPeso(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return "\u20B1" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "QRPH", label: "QRPH" },
];

interface CustomerAlloc {
  id: string; // internal key
  customerId: string;
  customerName: string;
  customerCode: string;
  outstanding: number;
  amount: string;
  soaList: any[];
  selectedSoas: Set<string>;
  noSoa: boolean;
}

type Step = "form" | "confirm" | "success";

export default function MultiPaymentPage() {
  const { token, locationId } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  const [method, setMethod] = useState("CHECK");
  const [totalAmount, setTotalAmount] = useState("");
  const [bank, setBank] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [cardType, setCardType] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [traceNo, setTraceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Customer allocations
  const [allocs, setAllocs] = useState<CustomerAlloc[]>([]);
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Success data
  const [successData, setSuccessData] = useState<any>(null);

  // Customer search
  useEffect(() => {
    if (searchIdx === null || searchQuery.length < 2 || !token || !locationId) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const res = await apiFetch<{ data: any[] }>(`/customers?search=${encodeURIComponent(searchQuery)}&limit=8`, { token, locationId });
        const existingIds = new Set(allocs.map((a) => a.customerId));
        setSearchResults((res.data || []).filter((c: any) => !existingIds.has(c.id)));
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, searchIdx, token, locationId, allocs]);

  const addCustomerSlot = () => {
    const newAlloc: CustomerAlloc = {
      id: crypto.randomUUID(),
      customerId: "", customerName: "", customerCode: "", outstanding: 0,
      amount: "", soaList: [], selectedSoas: new Set(), noSoa: false,
    };
    setAllocs([...allocs, newAlloc]);
    setSearchIdx(allocs.length);
    setSearchQuery("");
  };

  const selectCustomer = async (idx: number, customer: any) => {
    const updated = [...allocs];
    updated[idx] = {
      ...updated[idx],
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.phone || "",
      outstanding: parseFloat(customer.currentBalance || "0"),
      amount: customer.currentBalance || "0",
    };
    setAllocs(updated);
    setSearchIdx(null);
    setSearchQuery("");
    setSearchResults([]);

    // Fetch SOAs
    try {
      const res = await apiFetch<{ data: any[] }>(`/customers/${customer.id}/soa/history`, { token, locationId });
      const soaList = (res.data || []).filter((s: any) => s.status !== "VOID" && s.status !== "PAID");
      updated[idx].soaList = soaList;
      setAllocs([...updated]);
    } catch {}
  };

  const removeAlloc = (idx: number) => {
    setAllocs(allocs.filter((_, i) => i !== idx));
  };

  const updateAllocAmount = (idx: number, amount: string) => {
    const updated = [...allocs];
    updated[idx].amount = amount;
    setAllocs(updated);
  };

  const toggleSoa = (idx: number, soaId: string) => {
    const updated = [...allocs];
    const next = new Set(updated[idx].selectedSoas);
    if (next.has(soaId)) next.delete(soaId); else next.add(soaId);
    updated[idx].selectedSoas = next;
    // Auto-fill amount from selected SOAs
    const soaTotal = updated[idx].soaList.filter((s: any) => next.has(s.id)).reduce((sum: number, s: any) => sum + Math.max(0, (s.totalPayable || 0) - (s.paidAmount || 0)), 0);
    if (soaTotal > 0) updated[idx].amount = soaTotal.toFixed(2);
    setAllocs(updated);
  };

  const allocTotal = allocs.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const paymentTotal = parseFloat(totalAmount) || 0;
  const difference = paymentTotal - allocTotal;
  const isBalanced = Math.abs(difference) < 0.01;
  const canSubmit = paymentTotal > 0 && allocs.length > 0 && allocs.every((a) => a.customerId && parseFloat(a.amount) > 0) && isBalanced;

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const body = {
        method,
        totalAmount: paymentTotal.toFixed(2),
        referenceNumber: method === "CHECK" ? checkNumber : undefined,
        bank: method === "CHECK" ? bank : undefined,
        checkNumber: method === "CHECK" ? checkNumber : undefined,
        checkDate: method === "CHECK" ? checkDate : undefined,
        cardType: method === "CREDIT_CARD" ? cardType : undefined,
        batchNumber: method === "CREDIT_CARD" ? batchNo : undefined,
        traceNumber: method === "CREDIT_CARD" ? traceNo : undefined,
        notes: notes.trim() || undefined,
        allocations: allocs.map((a) => ({
          customerId: a.customerId,
          amount: (parseFloat(a.amount) || 0).toFixed(2),
          soaIds: a.selectedSoas.size > 0 ? [...a.selectedSoas] : undefined,
        })),
      };
      const result = await apiFetch<any>("/customers/multi-payment", { method: "POST", token, locationId, body: JSON.stringify(body) });
      setSuccessData(result);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Failed to record payment");
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col p-4">
      {/* Header */}
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><CreditCard size={16} className="text-primary" /></div>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Multi-Customer Payment</h1>
          <p className="text-[13px] text-muted-foreground">Record a single payment covering multiple customer accounts</p>
        </div>
      </div>

      {step === "form" && (
        <>
          {/* Payment Details */}
          <div className="mb-4 rounded-xl border border-border bg-background p-5 shadow-sm">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payment Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Total Amount</label>
                <input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold" />
              </div>
            </div>
            {method === "CHECK" && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Bank</label>
                  <input type="text" value={bank} onChange={(e) => setBank(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Check #</label>
                  <input type="text" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Check Date</label>
                  <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
            )}
            {method === "CREDIT_CARD" && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Card Type</label><input type="text" value={cardType} onChange={(e) => setCardType(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Batch #</label><input type="text" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                <div><label className="text-[11px] font-medium text-muted-foreground mb-1 block">Trace #</label><input type="text" value={traceNo} onChange={(e) => setTraceNo(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              </div>
            )}
            <div className="mt-3">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., Combined payment for LGU accounts"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Customer Allocations */}
          <div className="mb-4 rounded-xl border border-border bg-background p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Allocations</h2>
              <button onClick={addCustomerSlot} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90">
                <Plus size={13} /> Add Customer
              </button>
            </div>

            {allocs.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">Click &quot;Add Customer&quot; to begin allocating this payment.</div>
            )}

            <div className="space-y-3">
              {allocs.map((alloc, idx) => (
                <div key={alloc.id} className="rounded-lg border border-border p-4">
                  {/* Customer header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">Customer {idx + 1}</span>
                    <button onClick={() => removeAlloc(idx)} className="text-[11px] text-red-500 hover:underline flex items-center gap-0.5"><X size={12} /> Remove</button>
                  </div>

                  {!alloc.customerId ? (
                    /* Customer search */
                    <div className="relative">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type="text" value={searchIdx === idx ? searchQuery : ""} onChange={(e) => { setSearchIdx(idx); setSearchQuery(e.target.value); }}
                          onFocus={() => setSearchIdx(idx)} placeholder="Search customer..."
                          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm" />
                      </div>
                      {searchIdx === idx && searchResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                          {searchResults.map((c: any) => (
                            <button key={c.id} onClick={() => selectCustomer(idx, c)}
                              className="flex w-full items-center justify-between px-3 py-2 text-[12px] hover:bg-accent text-left">
                              <span className="font-medium">{c.name}</span>
                              <span className="text-muted-foreground">{fmtPeso(c.currentBalance)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Selected customer */
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-[13px] font-semibold text-foreground">{alloc.customerName}</span>
                          <span className="ml-2 text-[11px] text-muted-foreground">{alloc.customerCode}</span>
                        </div>
                        <span className="text-[12px] text-muted-foreground">Outstanding: <b className="text-red-600">{fmtPeso(alloc.outstanding)}</b></span>
                      </div>

                      {/* SOA selection */}
                      {alloc.soaList.length > 0 && !alloc.noSoa && (
                        <div className="mb-3">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Apply To</label>
                          <div className="max-h-24 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/50">
                            {alloc.soaList.map((s: any) => {
                              const remaining = Math.max(0, (s.totalPayable || 0) - (s.paidAmount || 0));
                              return (
                                <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px] cursor-pointer hover:bg-accent/30">
                                  <input type="checkbox" checked={alloc.selectedSoas.has(s.id)} onChange={() => toggleSoa(idx, s.id)} className="h-3.5 w-3.5 accent-primary" />
                                  <span className="font-mono font-semibold text-primary">{s.soaNumber}</span>
                                  <span className="text-muted-foreground flex-1">{fmtPeso(remaining)}</span>
                                  <span className={cn("rounded px-1.5 py-px text-[8px] font-semibold uppercase",
                                    s.status === "GENERATED" ? "bg-blue-100 text-blue-700" : s.status === "PARTIAL" ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground")}>{s.status}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Amount */}
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Amount for this customer</label>
                        <input type="number" step="0.01" value={alloc.amount} onChange={(e) => updateAllocAmount(idx, e.target.value)}
                          className="w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold" />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            {allocs.length > 0 && (
              <div className="mt-4 border-t border-border pt-3 space-y-1 text-[13px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Total Allocated</span><span className="font-semibold tabular-nums">{fmtPeso(allocTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment Amount</span><span className="font-semibold tabular-nums">{fmtPeso(paymentTotal)}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Difference</span>
                  <span className={cn("font-semibold tabular-nums", isBalanced ? "text-emerald-600" : "text-red-600")}>
                    {isBalanced ? `${fmtPeso(0)} \u2713` : fmtPeso(Math.abs(difference))}
                    {!isBalanced && (difference > 0 ? " unallocated" : " over-allocated")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex justify-end gap-2">
            <button onClick={() => router.back()} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button onClick={() => setStep("confirm")} disabled={!canSubmit}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              Review Payment {"\u2192"}
            </button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Confirm Multi-Customer Payment</h2>
          <div className="space-y-2 text-[13px] mb-4">
            <p><b>Method:</b> {METHOD_OPTIONS.find((o) => o.value === method)?.label}{method === "CHECK" ? ` — ${bank} #${checkNumber}${checkDate ? ` dated ${new Date(checkDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}` : ""}</p>
            <p><b>Total:</b> {fmtPeso(paymentTotal)}</p>
          </div>
          <div className="rounded-lg border border-border overflow-hidden mb-4">
            <div className="flex items-center bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="flex-1">Customer</div>
              <div className="w-36">SOA</div>
              <div className="w-32 text-right">Amount</div>
            </div>
            {allocs.map((a) => (
              <div key={a.id} className="flex items-center px-4 py-2.5 text-[13px] border-t border-border">
                <div className="flex-1 font-medium">{a.customerName}</div>
                <div className="w-36 text-[11px] text-muted-foreground font-mono">
                  {a.selectedSoas.size > 0
                    ? a.soaList.filter((s: any) => a.selectedSoas.has(s.id)).map((s: any) => s.soaNumber).join(", ")
                    : "General Balance"}
                </div>
                <div className="w-32 text-right tabular-nums font-semibold">{fmtPeso(a.amount)}</div>
              </div>
            ))}
            <div className="flex items-center px-4 py-2.5 text-[13px] border-t-2 border-border bg-muted/20">
              <div className="flex-1 font-bold">Total</div>
              <div className="w-36" />
              <div className="w-32 text-right tabular-nums font-bold text-lg text-emerald-600">{fmtPeso(paymentTotal)}</div>
            </div>
          </div>
          {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setStep("form")} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">{"\u2190"} Back</button>
            <button onClick={handleSubmit} disabled={loading}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
              {loading && <Loader2 size={14} className="animate-spin" />}
              Confirm &amp; Record Payment
            </button>
          </div>
        </div>
      )}

      {step === "success" && successData && (
        <div className="rounded-xl border border-border bg-background p-8 shadow-sm text-center">
          <div className="text-5xl mb-3">{"\u2705"}</div>
          <h2 className="text-lg font-semibold mb-1">Multi-Customer Payment Recorded</h2>
          <p className="text-[12px] font-mono text-muted-foreground mb-4">{successData.mpNumber}</p>
          <div className="mb-6 space-y-2">
            {successData.results?.map((r: any) => (
              <div key={r.paymentNumber} className="flex items-center justify-between text-[13px] px-4">
                <span className="font-mono text-primary">{r.paymentNumber}</span>
                <span className="text-foreground">{r.customerName}</span>
                <span className="tabular-nums font-semibold text-emerald-600">{fmtPeso(r.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2">
            <button onClick={() => router.push("/customers")} className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
