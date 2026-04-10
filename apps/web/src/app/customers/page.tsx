"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  Search,
  Building2,
  Truck,
  ShoppingBag,
  User,
  DollarSign,
  AlertTriangle,
  X,
  Hash,
  Download,
  TrendingUp,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useCustomerList,
  useARSummary,
  type Customer,
} from "@/hooks/use-customers-query";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { downloadCSV } from "@/lib/csv-export";

/* ── Helpers ── */
function fmtPeso(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "\u20B10.00";
  return `\u20B1${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNumber(v: number) { return v.toLocaleString("en-PH"); }
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const TYPE_BADGES: Record<string, string> = {
  INDIVIDUAL: "bg-slate-500/10 text-slate-600",
  SHOP: "bg-blue-500/10 text-blue-600",
  FLEET: "bg-purple-500/10 text-purple-600",
  WHOLESALE: "bg-amber-500/10 text-amber-600",
};

const TYPE_OPTIONS = ["INDIVIDUAL", "SHOP", "FLEET", "WHOLESALE"] as const;

const PAYMENT_TERMS_OPTIONS = [
  { value: 0, label: "COD" },
  { value: 7, label: "Net 7" },
  { value: 15, label: "Net 15" },
  { value: 30, label: "Net 30" },
  { value: 60, label: "Net 60" },
];

/* ── Tier type ── */
interface Tier { id: string; name: string; defaultDiscount: string; color: string | null; }

/* ── Form ── */
interface CustomerForm {
  name: string;
  phone: string;
  customerType: string;
  contactPerson: string;
  email: string;
  address: string;
  tin: string;
  creditLimit: string;
  paymentTermsDays: number;
  notes: string;
  tierId: string;
}

const emptyForm: CustomerForm = {
  name: "", phone: "", customerType: "INDIVIDUAL", contactPerson: "", email: "",
  address: "", tin: "", creditLimit: "0.00", paymentTermsDays: 30, notes: "", tierId: "",
};

/* ═══════════════════════════════════════ */
export default function CustomersPage() {
  const router = useRouter();
  const { token, locationId, user } = useAuth();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [balanceFilter, setBalanceFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  type SortField = "name" | "currentBalance" | "totalPurchases";
  type SortDir = "asc" | "desc";
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const submitSearch = () => setDebouncedSearch(search.trim());
  const clearSearchInput = () => { setSearch(""); setDebouncedSearch(""); };

  const customerQuery = useCustomerList(token, locationId, {
    search: debouncedSearch || undefined,
    type: typeFilter || undefined,
    hasBalance: balanceFilter === "with_balance" ? true : undefined,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59Z` : undefined,
    limit: 200,
  });

  const summaryQuery = useARSummary(token, locationId);
  const tiersQuery = useQuery<{ data: Tier[] }>({
    queryKey: ["customer-tiers"],
    queryFn: () => apiFetch<{ data: Tier[] }>("/discounts/tiers", { token, locationId }),
    enabled: !!token,
    staleTime: 300_000,
  });

  const allCustomers = customerQuery.data?.data ?? [];
  const summary = summaryQuery.data;
  const tiers = tiersQuery.data?.data ?? [];

  // Client-side filter + sort
  const customers = useMemo(() => {
    let result = [...allCustomers];
    if (balanceFilter === "no_balance") result = result.filter((c) => parseFloat(c.currentBalance) === 0);
    else if (balanceFilter === "with_balance") result = result.filter((c) => parseFloat(c.currentBalance) > 0);
    else if (balanceFilter === "unbilled") result = result.filter((c) => c.unbilledCount > 0);
    else if (balanceFilter === "fully_billed") result = result.filter((c) => c.totalChargeCount > 0 && c.unbilledCount === 0);
    else if (balanceFilter === "no_charges") result = result.filter((c) => c.totalChargeCount === 0);

    result.sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortBy) {
        case "currentBalance": va = parseFloat(a.currentBalance); vb = parseFloat(b.currentBalance); break;
        case "totalPurchases": va = parseFloat(a.totalPurchases); vb = parseFloat(b.totalPurchases); break;
        default: va = a.name.toLowerCase(); vb = b.name.toLowerCase();
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return result;
  }, [allCustomers, balanceFilter, sortBy, sortDir]);

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir(field === "name" ? "asc" : "desc"); }
  };

  const totalCustomers = customers.length;

  /* ── Modal ── */
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const modalOpen = showCreateModal || !!editingCustomer;
  const modalTitle = editingCustomer ? "Edit Customer" : "New Customer";

  useEffect(() => {
    if (editingCustomer) {
      setForm({
        name: editingCustomer.name,
        phone: editingCustomer.phone,
        customerType: editingCustomer.customerType,
        contactPerson: editingCustomer.contactPerson ?? "",
        email: editingCustomer.email ?? "",
        address: editingCustomer.address ?? "",
        tin: editingCustomer.tin ?? "",
        creditLimit: editingCustomer.creditLimit,
        paymentTermsDays: editingCustomer.paymentTermsDays,
        notes: editingCustomer.notes ?? "",
        tierId: editingCustomer.tierId ?? "",
      });
    } else if (showCreateModal) {
      setForm(emptyForm);
    }
    setSaveError("");
  }, [editingCustomer, showCreateModal]);

  const closeModal = () => { setShowCreateModal(false); setEditingCustomer(null); setForm(emptyForm); setSaveError(""); };

  const handleSave = async () => {
    setIsSaving(true); setSaveError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(), phone: form.phone.trim(), customerType: form.customerType,
        creditLimit: form.creditLimit, paymentTermsDays: form.paymentTermsDays,
        tierId: form.tierId || null,
      };
      if (form.contactPerson.trim()) payload.contactPerson = form.contactPerson.trim();
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.address.trim()) payload.address = form.address.trim();
      if (form.tin.trim()) payload.tin = form.tin.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      if (editingCustomer) {
        await apiFetch(`/customers/${editingCustomer.id}`, { method: "PATCH", body: JSON.stringify(payload), token, locationId });
      } else {
        await apiFetch("/customers", { method: "POST", body: JSON.stringify(payload), token, locationId });
      }
      closeModal(); customerQuery.refetch(); summaryQuery.refetch();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save customer");
    } finally { setIsSaving(false); }
  };

  const hasFilters = search || typeFilter || balanceFilter || dateFrom || dateTo;
  const resetFilters = () => { setSearch(""); setDebouncedSearch(""); setTypeFilter(""); setBalanceFilter(""); setDateFrom(""); setDateTo(""); };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Users size={16} className="text-primary" /></div>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Customer List</h1>
              <p className="text-[13px] text-muted-foreground">Manage customers, credit accounts, and receivables</p>
            </div>
          </div>
          {isManager && (
            <button onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus size={14} /> New Customer
            </button>
          )}
        </div>

        {/* KPI cards */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KPICard icon={<Users size={12} />} label="Total Customers" value={fmtNumber(totalCustomers)} />
          <KPICard icon={<DollarSign size={12} />} label="With Balance" value={fmtNumber(summary?.customerCount ?? 0)}
            className={summary && summary.customerCount > 0 ? "text-amber-600" : undefined} />
          <KPICard icon={<DollarSign size={12} />} label="Total Receivables" value={fmtPeso(summary?.totalReceivables ?? 0)}
            accent={summary && parseFloat(String(summary.totalReceivables)) > 0} />
          <KPICard icon={<AlertTriangle size={12} />} label="Overdue" value={`${summary?.overdueCount ?? 0} customers`}
            subtitle={summary && summary.overdueCount > 0 ? fmtPeso(summary.overdueAmount) : undefined}
            className={summary && summary.overdueCount > 0 ? "text-red-500" : undefined} />
          <KPICard icon={<TrendingUp size={12} />} label="Avg Balance"
            value={summary && summary.customerCount > 0 ? fmtPeso(parseFloat(String(summary.totalReceivables)) / summary.customerCount) : "\u20B10.00"} />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSearch(); } }}
              placeholder="Search customers... (press Enter)"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {search && <button onClick={clearSearchInput} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
              <button onClick={submitSearch} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Search"><Search size={12} /></button>
            </div>
          </div>

          {/* Type filter chips */}
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            <button onClick={() => setTypeFilter("")}
              className={cn("rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors", !typeFilter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>All</button>
            {([
              { value: "INDIVIDUAL", label: "Individual", icon: User },
              { value: "SHOP", label: "Shop", icon: ShoppingBag },
              { value: "FLEET", label: "Fleet", icon: Truck },
              { value: "WHOLESALE", label: "Wholesale", icon: Building2 },
            ] as const).map((t) => (
              <button key={t.value} onClick={() => setTypeFilter(typeFilter === t.value ? "" : t.value)}
                className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  typeFilter === t.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <t.icon size={10} /> {t.label}
              </button>
            ))}
          </div>

          {/* Balance filter */}
          <select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40">
            <option value="">All Customers</option>
            <option value="with_balance">With Balance</option>
            <option value="no_balance">No Balance</option>
            <option value="unbilled">{"\u26A0"} Unbilled</option>
            <option value="fully_billed">{"\u2713"} Fully Billed</option>
            <option value="no_charges">No Charges</option>
          </select>

          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />

          {hasFilters && <button onClick={resetFilters} className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Reset</button>}

          {/* Export */}
          {customers.length > 0 && (
            <button onClick={() => downloadCSV("customers",
              ["Name", "Type", "Tier", "Phone", "Credit Limit", "Balance", "Total Spent", "Terms"],
              customers.map((c) => [
                c.name, c.customerType, c.tierName ?? "—", c.phone,
                c.creditLimit, c.currentBalance, c.totalPurchases,
                `${c.paymentTermsDays} days`,
              ])
            )} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <button onClick={() => handleSort("name")} className={cn("flex-1 flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", sortBy === "name" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            Customer {sortBy === "name" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
          </button>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Type</div>
          <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Tier</div>
          <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Phone</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Credit Limit</div>
          <button onClick={() => handleSort("currentBalance")} className={cn("w-28 flex items-center justify-end gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", sortBy === "currentBalance" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            Balance {sortBy === "currentBalance" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
          </button>
          <button onClick={() => handleSort("totalPurchases")} className={cn("w-28 flex items-center justify-end gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", sortBy === "totalPurchases" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {dateFrom ? "Period" : "Spent"} {sortBy === "totalPurchases" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
          </button>
          {dateFrom && <div className="w-16 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Txns</div>}
          <div className="w-28 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Status</div>
        </div>

        {customerQuery.isLoading ? (
          <div>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/20" />)}</div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Users size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">{debouncedSearch || typeFilter ? "No customers matching your search" : "No customers yet"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {customers.map((c) => {
              const balance = parseFloat(c.currentBalance);
              return (
                <button key={c.id} onClick={() => {
                  const ref = c.matchedRef ? (() => { try { return JSON.parse(c.matchedRef); } catch { return null; } })() : null;
                  const highlight = ref?.number ? `?highlight=${encodeURIComponent(ref.number)}` : "";
                  router.push(`/customers/${c.id}${highlight}`);
                }}
                  className="flex w-full items-center px-4 py-3 text-left transition-colors hover:bg-accent/40">
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{c.name}</span>
                    {c.contactPerson && !c.matchedRef && <span className="block truncate text-[11px] text-muted-foreground">{c.contactPerson}</span>}
                    {c.matchedRef && (() => {
                      try {
                        const ref = JSON.parse(c.matchedRef);
                        const date = ref.date ? new Date(ref.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "";
                        const amt = ref.amount ? fmtPeso(ref.amount) : "";
                        const icon = ref.type === "payment" ? "\uD83D\uDCB3" : "\uD83D\uDCCE";
                        return (
                          <span className="block text-[10px] font-medium text-primary mt-0.5">
                            {icon} {ref.number}{date ? ` — ${date}` : ""}{amt ? ` — ${amt}` : ""}
                          </span>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                  <div className="w-24">
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold", TYPE_BADGES[c.customerType] ?? "bg-muted text-muted-foreground")}>
                      {c.customerType}
                    </span>
                  </div>
                  <div className="w-28">
                    {c.tierName ? (
                      <span className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: `${c.tierColor}15`, color: c.tierColor ?? undefined }}>
                        {c.tierName}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="w-28 text-[12px] text-muted-foreground truncate">{c.phone || "—"}</div>
                  <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">
                    {parseFloat(c.creditLimit) > 0 ? fmtPeso(c.creditLimit) : "—"}
                  </div>
                  <div className="w-28 text-right">
                    <span className={cn("text-[12px] font-semibold tabular-nums", balance === 0 ? "text-emerald-600" : "text-red-600")}>
                      {fmtPeso(c.currentBalance)}
                    </span>
                  </div>
                  <div className="w-28 text-right text-[12px] tabular-nums text-foreground">
                    {parseFloat(c.totalPurchases) > 0 ? fmtPeso(c.totalPurchases) : "—"}
                  </div>
                  {dateFrom && (
                    <div className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">
                      {c.txnCount > 0 ? c.txnCount : "—"}
                    </div>
                  )}
                  <div className="w-28 text-center">
                    {c.totalChargeCount === 0 ? (
                      <span className="text-[10px] text-muted-foreground">&mdash;</span>
                    ) : c.unbilledCount === 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-600">{"\u2713"} Billed</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-600">{"\u26A0"} {c.unbilledCount} unbilled</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{customers.length} customer{customers.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{modalTitle}</h3>
              <button onClick={closeModal} className="rounded p-1 hover:bg-muted"><X size={16} /></button>
            </div>

            {saveError && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">{saveError}</div>}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Customer name"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" autoFocus />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone *</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="0917-XXX-XXXX"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Customer Type</label>
                  <select value={form.customerType} onChange={(e) => setForm((p) => ({ ...p, customerType: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Pricing Tier</label>
                  <select value={form.tierId} onChange={(e) => setForm((p) => ({ ...p, tierId: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <option value="">No Tier</option>
                    {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.defaultDiscount}% off)</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contact Person</label>
                  <input type="text" value={form.contactPerson} onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">TIN</label>
                  <input type="text" value={form.tin} onChange={(e) => setForm((p) => ({ ...p, tin: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">City</label>
                  <input type="text" disabled value="Naga City"
                    className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Address</label>
                <textarea value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Credit Limit</label>
                  <input type="number" step="0.01" min="0" value={form.creditLimit}
                    onChange={(e) => setForm((p) => ({ ...p, creditLimit: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Payment Terms</label>
                  <select value={form.paymentTermsDays} onChange={(e) => setForm((p) => ({ ...p, paymentTermsDays: parseInt(e.target.value, 10) }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    {PAYMENT_TERMS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={closeModal} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleSave} disabled={!form.name.trim() || !form.phone.trim() || isSaving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {isSaving ? "Saving..." : editingCustomer ? "Save Changes" : "Create Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── KPI Card ── */
function KPICard({ icon, label, value, accent, className, subtitle }: {
  icon: React.ReactNode; label: string; value: string; accent?: boolean; className?: string; subtitle?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]", accent && "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20")}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-[11px] font-medium">{label}</span></div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", className)}>{value}</div>
      {subtitle && <div className="text-[11px] text-red-500 font-semibold tabular-nums mt-0.5">{subtitle}</div>}
    </div>
  );
}
