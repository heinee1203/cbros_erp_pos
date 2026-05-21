"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Search,
  ShieldAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtNum, fmtPeso, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useCustomerCollectionNotes,
  useCustomerCollectionsReport,
  useCustomerList,
  type Customer,
  type CustomerCollectionNote,
  type CustomerCollectionsQueueRow,
} from "@/hooks/use-customers-query";

type QueueView =
  | "all"
  | "overdue"
  | "aging_31_60"
  | "aging_61_90"
  | "aging_90_plus"
  | "followup_due"
  | "promise_to_pay"
  | "no_recent_payment"
  | "over_limit"
  | "incomplete"
  | "duplicate_risk"
  | "unbilled";

const QUEUE_FILTERS: Array<{ value: QueueView; label: string; description: string }> = [
  { value: "all", label: "All risks", description: "Every loaded account with collection context." },
  { value: "overdue", label: "Overdue", description: "Customers already past terms." },
  { value: "aging_31_60", label: "31-60", description: "Mid-aging balances." },
  { value: "aging_61_90", label: "61-90", description: "Late-stage receivables." },
  { value: "aging_90_plus", label: "90+", description: "Critical old balances." },
  { value: "followup_due", label: "Follow-up due", description: "Open notes due today or earlier." },
  { value: "promise_to_pay", label: "Promise to pay", description: "Accounts with promised dates." },
  { value: "no_recent_payment", label: "No recent payment", description: "Open balance without recent collection." },
  { value: "over_limit", label: "Over limit", description: "Balance exceeds the saved credit limit." },
  { value: "incomplete", label: "Incomplete", description: "Missing profile or credit fields." },
  { value: "duplicate_risk", label: "Duplicates", description: "Potential duplicate customer profiles." },
  { value: "unbilled", label: "Unbilled", description: "Charges not yet included in SOA." },
];

const NOTE_TYPES = [
  { value: "CALL", label: "Call" },
  { value: "SMS", label: "SMS / chat" },
  { value: "VISIT", label: "Visit" },
  { value: "PROMISE_TO_PAY", label: "Promise to pay" },
  { value: "DISPUTE", label: "Dispute" },
  { value: "NOTE", label: "Note" },
];

function moneyValue(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value || "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

function bucketAmount(customer: Customer, bucket: keyof NonNullable<Customer["agingBuckets"]>) {
  return customer.agingBuckets?.[bucket]?.amount ?? 0;
}

function hasIncompleteProfile(customer: Customer) {
  const missingCount = customer.safetySummary?.missingFields?.length ?? 0;
  const score = customer.safetySummary?.completenessScore ?? 100;
  return missingCount > 0 || score < 100;
}

function hasNoRecentPayment(customer: Customer) {
  return moneyValue(customer.currentBalance) > 0.01 && !customer.lastPaymentDate;
}

function isFollowUpDue(customer: Customer) {
  return (customer.collectionSummary?.dueFollowUpCount ?? 0) > 0;
}

function matchesQueue(customer: Customer, view: QueueView) {
  switch (view) {
    case "overdue":
      return customer.isOverdue;
    case "aging_31_60":
      return bucketAmount(customer, "days31to60") > 0;
    case "aging_61_90":
      return bucketAmount(customer, "days61to90") > 0;
    case "aging_90_plus":
      return bucketAmount(customer, "days90plus") > 0;
    case "followup_due":
      return isFollowUpDue(customer);
    case "promise_to_pay":
      return Boolean(customer.collectionSummary?.promiseToPayDate);
    case "no_recent_payment":
      return hasNoRecentPayment(customer);
    case "over_limit":
      return customer.safetySummary?.creditLimitStatus === "over_limit";
    case "incomplete":
      return hasIncompleteProfile(customer);
    case "duplicate_risk":
      return (customer.safetySummary?.duplicateWarnings?.length ?? 0) > 0;
    case "unbilled":
      return customer.unbilledCount > 0;
    default:
      return true;
  }
}

function queuePriority(customer: Customer) {
  const balance = moneyValue(customer.currentBalance);
  const oldAmount = bucketAmount(customer, "days90plus") + bucketAmount(customer, "days61to90");
  if (isFollowUpDue(customer)) return 1_000_000_000 + balance;
  if (oldAmount > 0) return 500_000_000 + oldAmount;
  if (customer.isOverdue) return 250_000_000 + balance;
  if (customer.unbilledCount > 0) return 100_000_000 + balance;
  return balance;
}

function riskBadges(customer: Customer) {
  const badges: Array<{ label: string; className: string }> = [];
  if (isFollowUpDue(customer)) {
    badges.push({ label: "Follow-up due", className: "border-red-300 bg-red-100 text-red-900" });
  }
  if (customer.collectionSummary?.promiseToPayDate) {
    badges.push({
      label: `Promise ${fmtDate(customer.collectionSummary.promiseToPayDate)}`,
      className: "border-blue-300 bg-blue-100 text-blue-900",
    });
  }
  if (bucketAmount(customer, "days90plus") > 0) {
    badges.push({ label: `90+ ${fmtPeso(bucketAmount(customer, "days90plus"))}`, className: "border-red-300 bg-red-100 text-red-900" });
  }
  if (customer.safetySummary?.creditLimitStatus === "over_limit") {
    badges.push({ label: "Over credit limit", className: "border-amber-300 bg-amber-100 text-amber-950" });
  }
  if (hasIncompleteProfile(customer)) {
    badges.push({ label: `Missing ${(customer.safetySummary?.missingFields ?? []).slice(0, 2).join(", ") || "profile info"}`, className: "border-amber-300 bg-amber-100 text-amber-950" });
  }
  if ((customer.safetySummary?.duplicateWarnings?.length ?? 0) > 0) {
    badges.push({ label: "Duplicate risk", className: "border-red-300 bg-red-100 text-red-900" });
  }
  if (hasNoRecentPayment(customer)) {
    badges.push({ label: "No recent payment", className: "border-slate-300 bg-slate-100 text-slate-800" });
  }
  if (customer.unbilledCount > 0) {
    badges.push({ label: `${customer.unbilledCount} unbilled`, className: "border-orange-300 bg-orange-100 text-orange-900" });
  }
  return badges.slice(0, 5);
}

function metricValue(customers: Customer[], predicate: (customer: Customer) => boolean) {
  return customers.filter(predicate).length;
}

export default function CustomerCollectionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, locationId } = useAuth();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<QueueView>("overdue");
  const [activeCustomer, setActiveCustomer] = useState<CustomerCollectionsQueueRow | null>(null);
  const [noteType, setNoteType] = useState("CALL");
  const [contactMethod, setContactMethod] = useState("PHONE");
  const [outcome, setOutcome] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [promisedAmount, setPromisedAmount] = useState("");
  const [note, setNote] = useState("");
  const [promiseToPayDate, setPromiseToPayDate] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const customersQuery = useCustomerList(token, locationId, {
    search: search || undefined,
    hasBalance: true,
    limit: 300,
  });
  const collectionsReportQuery = useCustomerCollectionsReport(token, locationId);
  const notesQuery = useCustomerCollectionNotes(token, locationId, activeCustomer?.id);

  const loadedCustomers = customersQuery.data?.data ?? [];
  const filteredCustomers = useMemo(
    () => loadedCustomers
      .filter((customer) => matchesQueue(customer, view))
      .sort((a, b) => queuePriority(b) - queuePriority(a)),
    [loadedCustomers, view],
  );

  const totals = useMemo(() => {
    const amount = loadedCustomers.reduce((sum, customer) => sum + moneyValue(customer.currentBalance), 0);
    const overdue = loadedCustomers.reduce((sum, customer) => sum + (customer.isOverdue ? moneyValue(customer.currentBalance) : 0), 0);
    const old = loadedCustomers.reduce((sum, customer) => sum + bucketAmount(customer, "days90plus") + bucketAmount(customer, "days61to90"), 0);
    return { amount, overdue, old };
  }, [loadedCustomers]);
  const reportTotals = collectionsReportQuery.data?.totals;

  const saveCollectionNote = async () => {
    if (!activeCustomer || !note.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/customers/${activeCustomer.id}/collection-notes`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          noteType,
          contactMethod,
          outcome: outcome || null,
          priority,
          note: note.trim(),
          promisedAmount: promisedAmount || null,
          promiseToPayDate: promiseToPayDate || null,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
        }),
      });
      setNote("");
      setOutcome("");
      setPriority("NORMAL");
      setPromisedAmount("");
      setPromiseToPayDate("");
      setFollowUpAt("");
      await invalidateActiveCustomerNotes();
    } catch (err: any) {
      setError(err?.message || "Failed to save collection note");
    } finally {
      setSaving(false);
    }
  };

  const invalidateActiveCustomerNotes = async () => {
    if (!activeCustomer) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customers", activeCustomer.id, "collection-notes"] }),
      queryClient.invalidateQueries({ queryKey: ["customers"] }),
    ]);
  };

  const markContactedToday = async () => {
    if (!activeCustomer) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/customers/${activeCustomer.id}/collection-notes`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          noteType: "CALL",
          contactMethod: "PHONE",
          outcome: "CONTACTED",
          priority: "NORMAL",
          note: "Contacted today from the Collections Queue.",
          followUpAt: null,
        }),
      });
      await invalidateActiveCustomerNotes();
    } catch (err: any) {
      setError(err?.message || "Failed to mark contacted today");
    } finally {
      setSaving(false);
    }
  };

  const resolveNote = async (item: CustomerCollectionNote) => {
    if (!activeCustomer) return;
    setError("");
    try {
      await apiFetch(`/customers/${activeCustomer.id}/collection-notes/${item.id}`, {
        method: "PATCH",
        token,
        locationId,
        body: JSON.stringify({ resolved: true }),
      });
      await invalidateActiveCustomerNotes();
    } catch (err: any) {
      setError(err?.message || "Failed to resolve collection note");
    }
  };

  const moveFollowUp = async (item: CustomerCollectionNote, days: number) => {
    if (!activeCustomer) return;
    setError("");
    const next = new Date();
    next.setDate(next.getDate() + days);
    next.setHours(9, 0, 0, 0);
    try {
      await apiFetch(`/customers/${activeCustomer.id}/collection-notes/${item.id}`, {
        method: "PATCH",
        token,
        locationId,
        body: JSON.stringify({ followUpAt: next.toISOString() }),
      });
      await invalidateActiveCustomerNotes();
    } catch (err: any) {
      setError(err?.message || "Failed to move follow-up");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-amber-50/40 px-4 py-8 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <button
          type="button"
          onClick={() => router.push("/customers")}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back to Customers
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <CalendarClock size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Customer Collections Queue</h1>
                <p className="text-sm text-muted-foreground">Follow up overdue accounts, promises to pay, profile risks, and unbilled customers.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/customers/soa")}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
            >
              Open SOA Workspace
            </button>
            <button
              type="button"
              onClick={() => router.push("/customers/payment-register")}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              Payment Register
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={Wallet} label="Open receivables" value={fmtPeso(reportTotals?.totalOpen ?? totals.amount)} sub={`${fmtNum(reportTotals?.customersWithBalance ?? loadedCustomers.length)} accounts with balance`} />
          <MetricCard icon={ShieldAlert} label="Overdue" value={fmtPeso(reportTotals?.overdue ?? totals.overdue)} sub={`${metricValue(loadedCustomers, (customer) => customer.isOverdue)} customers`} tone="danger" />
          <MetricCard icon={Clock} label="90+ days" value={fmtPeso(reportTotals?.days90Plus ?? totals.old)} sub="Critical old receivables" tone="warning" />
          <MetricCard icon={CalendarClock} label="Follow-up due" value={fmtNum(reportTotals?.followUpDue ?? metricValue(loadedCustomers, isFollowUpDue))} sub={`${fmtNum(reportTotals?.promisesMissed ?? 0)} missed promises`} tone="warning" />
          <MetricCard icon={FileText} label="Payment risk" value={fmtNum(reportTotals?.paymentRiskOpen ?? 0)} sub={`${fmtNum(reportTotals?.bouncedPayments ?? 0)} bounced payments`} tone={(reportTotals?.paymentRiskOpen ?? 0) > 0 ? "danger" : "neutral"} />
        </div>

        <div className="rounded-2xl border border-border bg-background/95 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="relative min-w-[280px] flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchDraft.trim());
              }}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search customers, phone, or code..."
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-10 text-sm outline-none focus:border-slate-400"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                Enter
              </button>
            </form>
            {QUEUE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setView(filter.value)}
                title={filter.description}
                className={cn(
                  "rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors",
                  view === filter.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <div className="grid grid-cols-[minmax(260px,1fr)_120px_120px_120px_130px] border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              <div>Customer</div>
              <div className="text-right">Balance</div>
              <div className="text-right">90+ / 61+</div>
              <div className="text-right">Last payment</div>
              <div className="text-right">Action</div>
            </div>

            {customersQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Loading collections queue...
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <CheckCircle2 size={30} className="text-emerald-600" />
                <p className="mt-3 text-sm font-semibold text-foreground">No customers match this queue.</p>
                <p className="mt-1 text-xs text-muted-foreground">Try another filter or search term.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredCustomers.map((customer) => {
                  const active = activeCustomer?.id === customer.id;
                  const badges = riskBadges(customer);
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        setActiveCustomer(customer);
                        setError("");
                      }}
                      className={cn(
                        "grid w-full grid-cols-[minmax(260px,1fr)_120px_120px_120px_130px] items-center px-4 py-3 text-left text-[13px] transition-colors hover:bg-accent/30",
                        active && "bg-slate-100/80",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold text-foreground">{customer.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{customer.customerType}</span>
                          {badges.map((badge) => (
                            <span key={badge.label} className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold", badge.className)}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right font-bold tabular-nums text-red-600">{fmtPeso(customer.currentBalance)}</div>
                      <div className="text-right text-[12px] tabular-nums text-muted-foreground">
                        <div>{fmtPeso(bucketAmount(customer, "days90plus"))}</div>
                        <div>{fmtPeso(bucketAmount(customer, "days61to90"))}</div>
                      </div>
                      <div className="text-right text-[12px] text-muted-foreground">{customer.lastPaymentDate ? timeAgo(customer.lastPaymentDate) : "Never"}</div>
                      <div className="flex justify-end gap-1">
                        <span className="rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground">Select</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-border bg-background p-4 shadow-sm">
            {!activeCustomer ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
                <UserRound size={34} className="text-muted-foreground/40" />
                <p className="mt-3 text-sm font-semibold text-foreground">Select a customer</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">Use this panel to record follow-up notes, promises to pay, or collection next steps.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Selected account</div>
                  <h2 className="mt-1 text-xl font-bold leading-tight text-foreground">{activeCustomer.name}</h2>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <MiniMetric label="Balance" value={fmtPeso(activeCustomer.currentBalance)} tone="danger" />
                    <MiniMetric label="Unbilled" value={fmtNum(activeCustomer.unbilledCount)} />
                    <MiniMetric label="Follow-ups" value={fmtNum(activeCustomer.collectionSummary?.dueFollowUpCount ?? 0)} tone={(activeCustomer.collectionSummary?.dueFollowUpCount ?? 0) > 0 ? "warning" : "neutral"} />
                    <MiniMetric label="Promise" value={activeCustomer.collectionSummary?.promiseToPayDate ? fmtDate(activeCustomer.collectionSummary.promiseToPayDate) : "None"} />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="mb-2 text-[12px] font-bold text-foreground">Aging snapshot</div>
                  <div className="space-y-1 text-[12px]">
                    <AgingLine label="Current" value={activeCustomer.agingBuckets?.current?.amount ?? 0} />
                    <AgingLine label="1-30" value={activeCustomer.agingBuckets?.days1to30?.amount ?? 0} />
                    <AgingLine label="31-60" value={activeCustomer.agingBuckets?.days31to60?.amount ?? 0} />
                    <AgingLine label="61-90" value={activeCustomer.agingBuckets?.days61to90?.amount ?? 0} />
                    <AgingLine label="90+" value={activeCustomer.agingBuckets?.days90plus?.amount ?? 0} danger />
                  </div>
                </div>

                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</div>}

                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="mb-2 text-[12px] font-bold text-foreground">Add collection note</div>
                  <div className="grid gap-2">
                    <select value={noteType} onChange={(event) => setNoteType(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]">
                      {NOTE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={contactMethod} onChange={(event) => setContactMethod(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Contact method">
                        <option value="PHONE">Phone</option>
                        <option value="SMS">SMS/chat</option>
                        <option value="EMAIL">Email</option>
                        <option value="VISIT">Visit</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Outcome">
                        <option value="">Outcome</option>
                        <option value="CONTACTED">Contacted</option>
                        <option value="NO_ANSWER">No answer</option>
                        <option value="PROMISED">Promised</option>
                        <option value="DISPUTED">Disputed</option>
                        <option value="ESCALATE">Escalate</option>
                      </select>
                      <select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Priority">
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={promiseToPayDate} onChange={(event) => setPromiseToPayDate(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Promise to pay date" />
                      <input type="number" min="0" step="0.01" value={promisedAmount} onChange={(event) => setPromisedAmount(event.target.value)} placeholder="Promised amount" className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Promised amount" />
                    </div>
                    <input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Follow-up date and time" />
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={4}
                      placeholder="What happened, who was contacted, and what should happen next?"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <button
                      type="button"
                      onClick={saveCollectionNote}
                      disabled={saving || !note.trim()}
                      className="h-9 rounded-lg bg-slate-900 px-3 text-[12px] font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Note"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[12px] font-bold text-foreground">Follow-through</div>
                    <button
                      type="button"
                      onClick={() => void markContactedToday()}
                      disabled={saving}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Mark contacted today
                    </button>
                  </div>
                  {notesQuery.isLoading ? (
                    <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" /> Loading notes...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <CollectionQueueNoteGroup
                        title="Open notes"
                        notes={(notesQuery.data?.data ?? []).filter((item) => !item.resolvedAt)}
                        onResolve={resolveNote}
                        onMoveFollowUp={moveFollowUp}
                      />
                      <CollectionQueueNoteGroup
                        title="Resolved"
                        notes={(notesQuery.data?.data ?? []).filter((item) => item.resolvedAt)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => router.push(`/customers/${activeCustomer.id}?tab=collections`)} className="rounded-lg border border-border px-3 py-2 text-[12px] font-bold text-foreground hover:bg-muted">
                    Open Account
                  </button>
                  <button type="button" onClick={() => router.push(`/customers/soa?customerId=${activeCustomer.id}`)} className="rounded-lg border border-border px-3 py-2 text-[12px] font-bold text-foreground hover:bg-muted">
                    Open SOA
                  </button>
                  <button type="button" onClick={() => router.push(`/customers/${activeCustomer.id}?tab=payments`)} className="rounded-lg border border-border px-3 py-2 text-[12px] font-bold text-foreground hover:bg-muted">
                    Record Payment
                  </button>
                  <button type="button" onClick={() => router.push(`/customers/${activeCustomer.id}?tab=documents`)} className="rounded-lg border border-border px-3 py-2 text-[12px] font-bold text-foreground hover:bg-muted">
                    Documents
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon size={15} /> {label}
      </div>
      <div className={cn("mt-2 text-2xl font-bold tabular-nums", toneClass)}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function CollectionQueueNoteGroup({
  title,
  notes,
  onResolve,
  onMoveFollowUp,
}: {
  title: string;
  notes: CustomerCollectionNote[];
  onResolve?: (note: CustomerCollectionNote) => void;
  onMoveFollowUp?: (note: CustomerCollectionNote, days: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title} ({notes.length})
      </div>
      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
          No {title.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.slice(0, 5).map((note) => (
            <div key={note.id} className="rounded-lg border border-border bg-muted/10 p-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{note.noteType}</span>
                {note.priority && note.priority !== "NORMAL" && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-800">{note.priority}</span>}
                {note.contactMethod && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{note.contactMethod}</span>}
                {note.outcome && <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800">{note.outcome}</span>}
                {note.promiseToPayDate && <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800">Promise {fmtDate(note.promiseToPayDate)}</span>}
                {typeof note.promisedAmount === "number" && note.promisedAmount > 0 && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">{fmtPeso(note.promisedAmount)}</span>}
                {note.followUpAt && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">Follow {fmtDate(note.followUpAt)}</span>}
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] text-foreground">{note.note}</p>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {note.createdByName ?? "Unknown"} - {note.createdAt ? fmtDate(note.createdAt) : ""}
              </div>
              {onResolve && !note.resolvedAt && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <button type="button" onClick={() => onResolve(note)} className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100">
                    Resolve
                  </button>
                  {onMoveFollowUp && (
                    <>
                      <button type="button" onClick={() => onMoveFollowUp(note, 1)} className="rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">
                        Tomorrow
                      </button>
                      <button type="button" onClick={() => onMoveFollowUp(note, 7)} className="rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">
                        +7 days
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {notes.length > 5 && <div className="text-[10px] text-muted-foreground">+{notes.length - 5} more notes on the account page</div>}
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "danger" | "warning" }) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-bold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}

function AgingLine({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-bold tabular-nums", danger && value > 0 ? "text-red-600" : "text-foreground")}>{fmtPeso(value)}</span>
    </div>
  );
}
