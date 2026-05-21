"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  History,
  Loader2,
  Printer,
  Search,
  Square,
  Users,
  X,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv-export";
import { fmtDate, fmtNum, fmtPeso, timeAgo } from "@/lib/format";
import { buildSOAHtml } from "@/lib/soa-html";
import {
  useARSummary,
  useCustomerList,
  type Customer,
  type CustomerTransaction,
  type SOAResponse,
} from "@/hooks/use-customers-query";

type CustomerSOAView =
  | ""
  | "with_balance"
  | "overdue"
  | "unbilled"
  | "no_recent_payment"
  | "profile_gaps"
  | "followup_due"
  | "promise_to_pay"
  | "aging_90_plus";

interface ExpandedState {
  customerId: string | null;
  loading: boolean;
  error: string;
  data: SOAResponse | null;
}

interface Notice {
  type: "success" | "error";
  message: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function moneyValue(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value || "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

function isDebit(tx: CustomerTransaction) {
  return tx.type === "CHARGE" || (tx.type === "ADJUSTMENT" && moneyValue(tx.amount) > 0);
}

function isBillable(tx: CustomerTransaction) {
  return tx.type === "CHARGE" || tx.type === "CREDIT_NOTE";
}

function dateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function isOutsideSOARange(tx: CustomerTransaction, from: string, to: string) {
  const txDate = dateKey(tx.recordedAt);
  const fromDate = dateKey(from);
  const toDate = dateKey(to);
  return Boolean(txDate && fromDate && toDate && (txDate < fromDate || txDate > toDate));
}

function hasRecentPayment(date: string | null | undefined, maxAgeDays = 60) {
  if (!date) return false;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return false;
  return (Date.now() - timestamp) / 86_400_000 <= maxAgeDays;
}

function missingProfileFields(customer: Customer) {
  if (customer.safetySummary?.missingFields) return customer.safetySummary.missingFields;
  const missing: string[] = [];
  if (!customer.address?.trim()) missing.push("address");
  if (!customer.tin?.trim()) missing.push("TIN");
  if (customer.customerType !== "INDIVIDUAL" && !customer.contactPerson?.trim()) missing.push("contact");
  if (moneyValue(customer.currentBalance) > 0.01 && moneyValue(customer.creditLimit) <= 0.01) missing.push("credit limit");
  return missing;
}

function customerStatus(customer: Customer) {
  const balance = moneyValue(customer.currentBalance);
  if (balance <= 0.01) return { label: "Current", className: "border-emerald-200 bg-emerald-100 text-emerald-800" };
  if (customer.isOverdue) return { label: "Overdue", className: "border-red-200 bg-red-100 text-red-800" };
  if (customer.unbilledCount > 0) return { label: "Unbilled", className: "border-amber-200 bg-amber-100 text-amber-900" };
  return { label: "Open", className: "border-slate-200 bg-slate-100 text-slate-800" };
}

function selectedTotals(transactions: CustomerTransaction[], selectedIds: Set<string>) {
  const selected = transactions.filter((tx) => selectedIds.has(tx.id));
  const charges = selected
    .filter((tx) => tx.type === "CHARGE")
    .reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0);
  const credits = selected
    .filter((tx) => tx.type === "CREDIT_NOTE")
    .reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0);
  return { selected, charges, credits, net: charges - credits };
}

function invoiceWarningBadges(tx: CustomerTransaction, rows: CustomerTransaction[]) {
  const warnings: Array<{ label: string; className: string }> = [];
  const ref = tx.referenceNumber?.trim();
  if (tx.type === "CHARGE" && !ref) warnings.push({ label: "Missing ref", className: "border-amber-300 bg-amber-100 text-amber-950" });
  if (tx.type === "CHARGE" && ref && rows.some((row) => row.id !== tx.id && row.referenceNumber?.trim()?.toLowerCase() === ref.toLowerCase())) {
    warnings.push({ label: "Duplicate ref", className: "border-red-300 bg-red-100 text-red-900" });
  }
  if (Math.abs(moneyValue(tx.amount)) <= 0.01) warnings.push({ label: "Amount anomaly", className: "border-red-300 bg-red-100 text-red-900" });
  const ageDays = (Date.now() - new Date(tx.recordedAt).getTime()) / 86_400_000;
  if (tx.type === "CHARGE" && ageDays > 90 && !tx.billed) warnings.push({ label: "Old unpaid", className: "border-red-300 bg-red-100 text-red-900" });
  if (tx.type === "CHARGE" && !tx.billed) warnings.push({ label: "Unbilled", className: "border-orange-300 bg-orange-100 text-orange-900" });
  if (tx.type === "CREDIT_NOTE") warnings.push({ label: "Credit memo", className: "border-emerald-300 bg-emerald-100 text-emerald-900" });
  return warnings;
}

function viewLabel(view: CustomerSOAView) {
  if (view === "with_balance") return "With balance";
  if (view === "overdue") return "Overdue";
  if (view === "unbilled") return "Unbilled";
  if (view === "no_recent_payment") return "No recent payment";
  if (view === "profile_gaps") return "Profile gaps";
  if (view === "followup_due") return "Follow-up due";
  if (view === "promise_to_pay") return "Promise to pay";
  if (view === "aging_90_plus") return "90+ aging";
  return "All customers";
}

export default function CustomerSOAPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, locationId, user } = useAuth();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  const initialCustomerId = searchParams?.get("customerId") || "";
  const initialView = (searchParams?.get("view") || "") as CustomerSOAView;

  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [view, setView] = useState<CustomerSOAView>(
    ["with_balance", "overdue", "unbilled", "no_recent_payment", "profile_gaps", "followup_due", "promise_to_pay", "aging_90_plus"].includes(initialView)
      ? initialView
      : "",
  );
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [expanded, setExpanded] = useState<ExpandedState>({
    customerId: initialCustomerId || null,
    loading: false,
    error: "",
    data: null,
  });
  const [selectedByCustomer, setSelectedByCustomer] = useState<Record<string, Set<string>>>({});
  const [processingCustomerId, setProcessingCustomerId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const customerQuery = useCustomerList(token, locationId, {
    search: committedSearch || undefined,
    limit: 200,
  });
  const summaryQuery = useARSummary(token, locationId);

  const allCustomers = customerQuery.data?.data ?? [];
  const filteredCustomers = useMemo(() => {
    let rows = [...allCustomers];
    if (view === "with_balance") rows = rows.filter((c) => moneyValue(c.currentBalance) > 0.01);
    if (view === "overdue") rows = rows.filter((c) => c.isOverdue);
    if (view === "unbilled") rows = rows.filter((c) => c.unbilledCount > 0);
    if (view === "no_recent_payment") {
      rows = rows.filter((c) => moneyValue(c.currentBalance) > 0.01 && !hasRecentPayment(c.lastPaymentDate));
    }
    if (view === "profile_gaps") rows = rows.filter((c) => missingProfileFields(c).length > 0);
    if (view === "followup_due") rows = rows.filter((c) => (c.collectionSummary?.dueFollowUpCount ?? 0) > 0);
    if (view === "promise_to_pay") rows = rows.filter((c) => Boolean(c.collectionSummary?.promiseToPayDate));
    if (view === "aging_90_plus") rows = rows.filter((c) => (c.agingBuckets?.days90plus?.amount ?? 0) > 0);
    return rows.sort((a, b) => moneyValue(b.currentBalance) - moneyValue(a.currentBalance));
  }, [allCustomers, view]);

  const safetyCounts = useMemo(() => ({
    withBalance: allCustomers.filter((c) => moneyValue(c.currentBalance) > 0.01).length,
    overdue: allCustomers.filter((c) => c.isOverdue).length,
    unbilled: allCustomers.filter((c) => c.unbilledCount > 0).length,
    noRecentPayment: allCustomers.filter((c) => moneyValue(c.currentBalance) > 0.01 && !hasRecentPayment(c.lastPaymentDate)).length,
    profileGaps: allCustomers.filter((c) => missingProfileFields(c).length > 0).length,
    followUpDue: allCustomers.filter((c) => (c.collectionSummary?.dueFollowUpCount ?? 0) > 0).length,
    promiseToPay: allCustomers.filter((c) => Boolean(c.collectionSummary?.promiseToPayDate)).length,
    aging90Plus: allCustomers.filter((c) => (c.agingBuckets?.days90plus?.amount ?? 0) > 0).length,
  }), [allCustomers]);

  const fetchSOA = useCallback(async (customerId: string) => {
    if (!token || !locationId || !customerId) return;
    setExpanded({ customerId, loading: true, error: "", data: null });
    try {
      const params = new URLSearchParams({
        from: dateFrom,
        to: dateTo,
        includeUnbilled: "true",
      });
      const data = await apiFetch<SOAResponse>(
        `/customers/reports/soa/${customerId}?${params.toString()}`,
        { token, locationId },
      );
      setExpanded({ customerId, loading: false, error: "", data });
      setSelectedByCustomer((prev) => ({
        ...prev,
        [customerId]: new Set(data.transactions.filter((tx) => isBillable(tx) && !tx.billed).map((tx) => tx.id)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load customer SOA preview";
      setExpanded({ customerId, loading: false, error: message, data: null });
    }
  }, [dateFrom, dateTo, locationId, token]);

  useEffect(() => {
    if (expanded.customerId) {
      void fetchSOA(expanded.customerId);
    }
  }, [expanded.customerId, fetchSOA]);

  const submitSearch = () => setCommittedSearch(search.trim());
  const clearSearch = () => {
    setSearch("");
    setCommittedSearch("");
  };

  const toggleExpanded = (customerId: string) => {
    if (expanded.customerId === customerId) {
      setExpanded({ customerId: null, loading: false, error: "", data: null });
      return;
    }
    void fetchSOA(customerId);
  };

  const toggleSelected = (customerId: string, txId: string) => {
    setSelectedByCustomer((prev) => {
      const next = new Set(prev[customerId] ?? []);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return { ...prev, [customerId]: next };
    });
  };

  const setSelected = (customerId: string, ids: string[]) => {
    setSelectedByCustomer((prev) => ({ ...prev, [customerId]: new Set(ids) }));
  };

  const printSelected = (customerId: string) => {
    if (!expanded.data || expanded.customerId !== customerId) return;
    const selectedIds = selectedByCustomer[customerId] ?? new Set<string>();
    const { selected, net } = selectedTotals(expanded.data.transactions, selectedIds);
    if (selected.length === 0) {
      setNotice({ type: "error", message: "Select at least one invoice or credit memo to preview." });
      return;
    }
    const html = buildSOAHtml({
      customer: expanded.data.customer,
      transactions: selected,
      openingBalance: 0,
      closingBalance: net,
      from: dateFrom,
      to: dateTo,
      generatedBy: user?.fullName || user?.email || "Current user",
    });
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.onload = () => w.print();
    }
  };

  const generateSelectedSOA = async (customerId: string) => {
    if (!expanded.data || expanded.customerId !== customerId || !token || !locationId) return;
    const selectedIds = Array.from(selectedByCustomer[customerId] ?? []);
    if (selectedIds.length === 0) {
      setNotice({ type: "error", message: "Select at least one unbilled row before generating an SOA." });
      return;
    }

    setProcessingCustomerId(customerId);
    try {
      const result = await apiFetch<{ soaNumber: string }>(`/customers/${customerId}/soa/generate`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          from: dateFrom,
          to: dateTo,
          transactionIds: selectedIds,
          unbilledOnly: false,
        }),
      });

      const { selected, net } = selectedTotals(expanded.data.transactions, new Set(selectedIds));
      const html = buildSOAHtml({
        customer: expanded.data.customer,
        transactions: selected,
        openingBalance: 0,
        closingBalance: net,
        from: dateFrom,
        to: dateTo,
        soaNumber: result.soaNumber,
        generatedBy: user?.fullName || user?.email || "Current user",
      });
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.onload = () => w.print();
      }

      setNotice({ type: "success", message: `Generated ${result.soaNumber}.` });
      await fetchSOA(customerId);
      customerQuery.refetch();
      summaryQuery.refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate SOA";
      setNotice({ type: "error", message });
    } finally {
      setProcessingCustomerId(null);
    }
  };

  const summary = summaryQuery.data;
  const totalListed = filteredCustomers.reduce((sum, c) => sum + moneyValue(c.currentBalance), 0);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
              <FileText size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Customer Statement of Account</h1>
              <p className="text-[13px] text-muted-foreground">Review customers, select billable rows, preview, and generate SOAs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/customers/soa-search")}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-semibold text-foreground hover:bg-muted"
            >
              <History size={14} /> SOA History
            </button>
            <button
              type="button"
              onClick={() => router.push("/customers")}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-semibold text-foreground hover:bg-muted"
            >
              <Users size={14} /> Customer Master
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total receivables" value={fmtPeso(summary?.totalReceivables ?? 0)} subtitle={`${fmtNum(summary?.customerCount ?? 0)} customers`} tone="neutral" />
          <SummaryCard label="Overdue" value={fmtPeso(summary?.overdueAmount ?? 0)} subtitle={`${fmtNum(summary?.overdueCount ?? 0)} customers`} tone="danger" />
          <SummaryCard label="Unbilled customers" value={fmtNum(safetyCounts.unbilled)} subtitle="Need SOA review" tone="warning" />
          <SummaryCard label="Listed balance" value={fmtPeso(totalListed)} subtitle={viewLabel(view)} tone="neutral" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2 shadow-sm sm:grid-cols-8">
          <FilterTile label="With balance" value={safetyCounts.withBalance} active={view === "with_balance"} onClick={() => setView(view === "with_balance" ? "" : "with_balance")} />
          <FilterTile label="Overdue" value={safetyCounts.overdue} active={view === "overdue"} tone="danger" onClick={() => setView(view === "overdue" ? "" : "overdue")} />
          <FilterTile label="Unbilled" value={safetyCounts.unbilled} active={view === "unbilled"} tone="warning" onClick={() => setView(view === "unbilled" ? "" : "unbilled")} />
          <FilterTile label="No recent payment" value={safetyCounts.noRecentPayment} active={view === "no_recent_payment"} onClick={() => setView(view === "no_recent_payment" ? "" : "no_recent_payment")} />
          <FilterTile label="Profile gaps" value={safetyCounts.profileGaps} active={view === "profile_gaps"} tone="warning" onClick={() => setView(view === "profile_gaps" ? "" : "profile_gaps")} />
          <FilterTile label="Follow-up due" value={safetyCounts.followUpDue} active={view === "followup_due"} tone="danger" onClick={() => setView(view === "followup_due" ? "" : "followup_due")} />
          <FilterTile label="Promise to pay" value={safetyCounts.promiseToPay} active={view === "promise_to_pay"} tone="warning" onClick={() => setView(view === "promise_to_pay" ? "" : "promise_to_pay")} />
          <FilterTile label="90+ aging" value={safetyCounts.aging90Plus} active={view === "aging_90_plus"} tone="danger" onClick={() => setView(view === "aging_90_plus" ? "" : "aging_90_plus")} />
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              placeholder="Search customer or code... (press Enter)"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              {search && (
                <button type="button" onClick={clearSearch} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              )}
              <button type="button" onClick={submitSearch} className="rounded p-0.5 text-muted-foreground hover:text-primary">
                <Search size={12} />
              </button>
            </div>
          </div>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as CustomerSOAView)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
          >
            <option value="">All customers</option>
            <option value="with_balance">With balance</option>
            <option value="overdue">Overdue</option>
            <option value="unbilled">Unbilled</option>
            <option value="no_recent_payment">No recent payment</option>
            <option value="profile_gaps">Profile gaps</option>
            <option value="followup_due">Follow-up due</option>
            <option value="promise_to_pay">Promise to pay</option>
            <option value="aging_90_plus">90+ day aging</option>
          </select>
          <DateRangePicker
            startDate={dateFrom}
            endDate={dateTo}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
              setSelectedByCustomer({});
            }}
          />
          <button
            type="button"
            onClick={() =>
              downloadCSV(
                "customer-soa-workspace",
                ["Customer", "Type", "Code", "Balance", "Unbilled", "Last Payment", "Status", "Missing Fields", "Follow Up", "Promise", "90+ Aging"],
                filteredCustomers.map((c) => [
                  c.name,
                  c.customerType,
                  c.phone,
                  c.currentBalance,
                  String(c.unbilledCount),
                  c.lastPaymentDate ? fmtDate(c.lastPaymentDate) : "Never",
                  c.isOverdue ? "Overdue" : moneyValue(c.currentBalance) > 0 ? "Open" : "Current",
                  missingProfileFields(c).join("; "),
                  c.collectionSummary?.nextFollowUpAt ? fmtDate(c.collectionSummary.nextFollowUpAt) : "",
                  c.collectionSummary?.promiseToPayDate ? fmtDate(c.collectionSummary.promiseToPayDate) : "",
                  String(c.agingBuckets?.days90plus?.amount ?? 0),
                ]),
              )
            }
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold text-foreground hover:bg-muted"
          >
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <div className="w-8" />
          <div className="flex-1">Customer</div>
          <div className="w-28 text-right">Unbilled</div>
          <div className="w-32 text-right">Balance</div>
          <div className="w-28 text-right">Last Payment</div>
          <div className="w-28 text-center">Status</div>
          <div className="w-28 text-right">Actions</div>
        </div>

        {customerQuery.isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText size={24} className="text-muted-foreground/30" />
            <p className="mt-3 text-[13px] font-medium text-foreground">No customers found for this SOA view.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Try clearing filters or widening the customer search.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredCustomers.map((customer) => (
              <CustomerSOARow
                key={customer.id}
                customer={customer}
                expanded={expanded}
                selectedIds={selectedByCustomer[customer.id] ?? new Set<string>()}
                processing={processingCustomerId === customer.id}
                isManager={isManager}
                onToggle={() => toggleExpanded(customer.id)}
                onOpenCustomer={() => router.push(`/customers/${customer.id}`)}
                onRecordPayment={() => router.push(`/customers/${customer.id}?action=payment`)}
                onToggleSelected={(txId) => toggleSelected(customer.id, txId)}
                onSelectUnbilled={(ids) => setSelected(customer.id, ids)}
                onPrintSelected={() => printSelected(customer.id)}
                onGenerateSelected={() => void generateSelectedSOA(customer.id)}
              />
            ))}
          </div>
        )}
      </div>

      {notice && (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg",
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {notice.type === "success" ? <CheckSquare size={14} /> : <AlertTriangle size={14} />}
          <span className="text-[13px] font-semibold">{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-2 text-current opacity-70 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function CustomerSOARow({
  customer,
  expanded,
  selectedIds,
  processing,
  isManager,
  onToggle,
  onOpenCustomer,
  onRecordPayment,
  onToggleSelected,
  onSelectUnbilled,
  onPrintSelected,
  onGenerateSelected,
}: {
  customer: Customer;
  expanded: ExpandedState;
  selectedIds: Set<string>;
  processing: boolean;
  isManager: boolean;
  onToggle: () => void;
  onOpenCustomer: () => void;
  onRecordPayment: () => void;
  onToggleSelected: (txId: string) => void;
  onSelectUnbilled: (ids: string[]) => void;
  onPrintSelected: () => void;
  onGenerateSelected: () => void;
}) {
  const isOpen = expanded.customerId === customer.id;
  const status = customerStatus(customer);
  const missing = missingProfileFields(customer);
  const data = isOpen ? expanded.data : null;
  const billable = data?.transactions.filter(isBillable) ?? [];
  const unbilled = billable.filter((tx) => !tx.billed);
  const unbilledOutsideRange = data
    ? unbilled.filter((tx) => isOutsideSOARange(tx, data.from, data.to))
    : [];
  const availableCredits = billable.filter((tx) => tx.type === "CREDIT_NOTE" && !tx.billed);
  const appliedCredits = billable.filter((tx) => tx.type === "CREDIT_NOTE" && tx.billed);
  const selected = selectedTotals(billable, selectedIds);
  const billingBlocked = customer.creditControl?.blocksBilling;
  const includeAvailableCredits = () => {
    onSelectUnbilled(Array.from(new Set([...Array.from(selectedIds), ...availableCredits.map((tx) => tx.id)])));
  };
  const excludeAvailableCredits = () => {
    const creditIds = new Set(availableCredits.map((tx) => tx.id));
    onSelectUnbilled(Array.from(selectedIds).filter((id) => !creditIds.has(id)));
  };

  return (
    <div>
      <div className="flex items-center px-4 py-2 text-[13px] hover:bg-accent/30">
        <button type="button" onClick={onToggle} className="w-8 text-muted-foreground hover:text-foreground">
          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpenCustomer} className="block truncate text-left font-semibold text-foreground hover:text-primary hover:underline">
            {customer.name}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{customer.customerType}</span>
            {customer.phone && <span className="text-[11px] text-muted-foreground">{customer.phone}</span>}
            {missing.length > 0 && (
              <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                Missing {missing.slice(0, 2).join(", ")}{missing.length > 2 ? ` +${missing.length - 2}` : ""}
              </span>
            )}
            {(customer.collectionSummary?.dueFollowUpCount ?? 0) > 0 && (
              <span className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900">
                Follow-up due
              </span>
            )}
            {customer.collectionSummary?.promiseToPayDate && (
              <span className="rounded-md border border-blue-300 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                Promise {fmtDate(customer.collectionSummary.promiseToPayDate)}
              </span>
            )}
            {(customer.agingBuckets?.days90plus?.amount ?? 0) > 0 && (
              <span className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900">
                90+ {fmtPeso(customer.agingBuckets?.days90plus?.amount ?? 0)}
              </span>
            )}
            {customer.creditControl?.holdType === "WATCHLIST" && (
              <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                Credit watchlist
              </span>
            )}
            {billingBlocked && (
              <span className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900">
                Billing blocked
              </span>
            )}
            {(customer.disputeSummary?.openCount ?? 0) > 0 && (
              <span className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900">
                {customer.disputeSummary?.openCount} open dispute{customer.disputeSummary?.openCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="w-28 text-right text-[12px] font-semibold tabular-nums text-amber-800">{customer.unbilledCount}</div>
        <div className="w-32 text-right text-[12px] font-bold tabular-nums text-red-600">{fmtPeso(customer.currentBalance)}</div>
        <div className="w-28 text-right text-[12px] text-muted-foreground">
          {customer.lastPaymentDate ? timeAgo(customer.lastPaymentDate) : "Never"}
        </div>
        <div className="w-28 text-center">
          <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold", status.className)}>{status.label}</span>
        </div>
        <div className="flex w-28 justify-end gap-1">
          {moneyValue(customer.currentBalance) > 0.01 && (
            <button type="button" onClick={onRecordPayment} className="rounded px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50">
              Pay
            </button>
          )}
          <button type="button" onClick={onOpenCustomer} className="rounded px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted">
            Detail
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-border bg-muted/10 px-4 py-4">
          {expanded.loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Loading SOA preview...
            </div>
          ) : expanded.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-800">{expanded.error}</div>
          ) : data ? (
            <div className="space-y-3">
              {billingBlocked && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
                  <strong>SOA generation blocked:</strong> {customer.creditControl?.reason || "Customer account is on billing hold."}
                  {customer.creditControl?.note ? <span> {customer.creditControl.note}</span> : null}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <MiniMetric label="Opening" value={fmtPeso(data.openingBalance)} />
                <MiniMetric label="Charges" value={fmtPeso(billable.filter((tx) => tx.type === "CHARGE").reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0))} />
                <MiniMetric label="Credits" value={fmtPeso(billable.filter((tx) => tx.type === "CREDIT_NOTE").reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0))} tone="success" />
                <MiniMetric label="Closing" value={fmtPeso(data.closingBalance)} />
                <MiniMetric label="Unbilled rows" value={fmtNum(unbilled.length)} tone="warning" />
              </div>

              {unbilledOutsideRange.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
                  <strong>{unbilledOutsideRange.length} unbilled row{unbilledOutsideRange.length === 1 ? "" : "s"} outside the selected date range included.</strong>{" "}
                  These are shown so older receipts/charges do not disappear while still needing an SOA.
                </div>
              )}

              {(availableCredits.length > 0 || appliedCredits.length > 0) && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-bold">Available Credit Memos</div>
                      <p className="mt-0.5 text-[11px] text-emerald-900/80">
                        Credits are never hidden or auto-applied silently. Include only the credit memos you want on this SOA.
                      </p>
                    </div>
                    {availableCredits.length > 0 && (
                      <div className="flex gap-1">
                        <button type="button" onClick={includeAvailableCredits} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
                          Include all credits
                        </button>
                        <button type="button" onClick={excludeAvailableCredits} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
                          Exclude credits
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {availableCredits.map((tx) => (
                      <label key={tx.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[12px]">
                        <button
                          type="button"
                          onClick={() => onToggleSelected(tx.id)}
                          className="text-emerald-700"
                        >
                          {selectedIds.has(tx.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-emerald-950">{tx.referenceNumber || tx.notes || "Credit memo"}</span>
                          <span className="text-[10px] text-emerald-800">{fmtDate(tx.recordedAt)} - available</span>
                        </span>
                        <span className="font-bold tabular-nums text-emerald-800">{fmtPeso(Math.abs(moneyValue(tx.amount)))}</span>
                      </label>
                    ))}
                    {appliedCredits.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[12px] opacity-75">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-slate-700">{tx.referenceNumber || tx.notes || "Credit memo"}</span>
                          <span className="text-[10px] text-slate-500">Already applied to an SOA</span>
                        </span>
                        <span className="font-bold tabular-nums text-slate-700">{fmtPeso(Math.abs(moneyValue(tx.amount)))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border bg-background">
                <div className="flex items-center border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <div className="w-8" />
                  <div className="w-28">Date</div>
                  <div className="flex-1">Reference</div>
                  <div className="w-28 text-right">Debit</div>
                  <div className="w-28 text-right">Credit</div>
                  <div className="w-24 text-center">SOA</div>
                </div>

                {billable.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-muted-foreground">
                    No billable charges or credit memos were found for this customer.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {billable.map((tx) => {
                      const checked = selectedIds.has(tx.id);
                      const disabled = Boolean(tx.billed);
                      const warnings = invoiceWarningBadges(tx, billable);
                      const outsideRange = data ? isOutsideSOARange(tx, data.from, data.to) : false;
                      return (
                        <div key={tx.id} className={cn("flex items-center px-3 py-2 text-[12px]", checked && "bg-primary/[0.04]", disabled && "opacity-60")}>
                          <div className="w-8">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => onToggleSelected(tx.id)}
                              className="text-muted-foreground disabled:cursor-not-allowed"
                            >
                              {checked ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                            </button>
                          </div>
                          <div className="w-28 text-muted-foreground">{fmtDate(tx.recordedAt)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-foreground">{tx.referenceNumber || tx.notes || tx.type}</div>
                            {tx.notes && tx.referenceNumber && <div className="truncate text-[10px] text-muted-foreground">{tx.notes}</div>}
                            {warnings.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {warnings.slice(0, 3).map((warning) => (
                                  <span key={warning.label} className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold", warning.className)}>
                                    {warning.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {outsideRange && (
                              <div className="mt-1">
                                <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-950">
                                  Outside selected range
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="w-28 text-right tabular-nums text-red-600">{isDebit(tx) ? fmtPeso(Math.abs(moneyValue(tx.amount))) : ""}</div>
                          <div className="w-28 text-right tabular-nums text-emerald-700">{!isDebit(tx) ? fmtPeso(Math.abs(moneyValue(tx.amount))) : ""}</div>
                          <div className="w-24 text-center">
                            <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold", disabled ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                              {disabled ? "Billed" : "Ready"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectUnbilled(unbilled.map((tx) => tx.id))}
                    className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                  >
                    Select unbilled
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectUnbilled([])}
                    className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-[12px] font-semibold text-foreground">
                    {selected.selected.length} selected - Net {fmtPeso(selected.net)}
                  </span>
                  <button
                    type="button"
                    onClick={onPrintSelected}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                  >
                    <Printer size={12} /> Preview only
                  </button>
                  {isManager && (
                    <button
                      type="button"
                      onClick={onGenerateSelected}
                      disabled={processing || selected.selected.length === 0 || billingBlocked}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processing ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                      Generate SOA record
                    </button>
                  )}
                </div>
                <p className="w-full text-[11px] text-muted-foreground">
                  Preview only does not create a record. Generate SOA record marks selected unbilled rows as billed and opens the printout.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, subtitle, tone }: { label: string; value: string; subtitle?: string; tone: "neutral" | "danger" | "warning" }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        tone === "danger" ? "border-red-200" : tone === "warning" ? "border-amber-200" : "border-border",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-900" : "text-foreground")}>{value}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

function FilterTile({ label, value, active, tone = "neutral", onClick }: { label: string; value: number; active: boolean; tone?: "neutral" | "danger" | "warning"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        tone === "danger"
          ? active
            ? "border-red-500 bg-red-100 text-red-950 focus-visible:ring-red-500"
            : "border-red-200 bg-red-50 text-red-900 hover:border-red-400 hover:bg-red-100 focus-visible:ring-red-500"
          : tone === "warning"
            ? active
              ? "border-amber-500 bg-amber-100 text-amber-950 focus-visible:ring-amber-500"
              : "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-400 hover:bg-amber-100 focus-visible:ring-amber-500"
            : active
              ? "border-slate-500 bg-slate-200 text-slate-950 focus-visible:ring-slate-500"
              : "border-slate-300 bg-slate-100 text-slate-900 hover:border-slate-500 hover:bg-slate-200 focus-visible:ring-slate-500",
      )}
    >
      <span className="block text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">{label}</span>
      <span className="mt-0.5 block text-lg font-bold tabular-nums">{fmtNum(value)}</span>
    </button>
  );
}

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-[15px] font-bold tabular-nums", tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-900" : "text-foreground")}>{value}</div>
    </div>
  );
}
