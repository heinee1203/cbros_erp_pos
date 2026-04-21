"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
  Download,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Eye,
  FileText,
  Pencil,
  CheckCircle,
  FileDown,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtNum, fmtDate, timeAgo } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import {
  useCustomerList,
  useARSummary,
  type Customer,
} from "@/hooks/use-customers-query";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { downloadCSV } from "@/lib/csv-export";

/* ── Constants ── */
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

/* ── Types ── */
interface Tier { id: string; name: string; defaultDiscount: string; color: string | null; }

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
  type SortField = "name" | "currentBalance";
  type SortDir = "asc" | "desc";
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  /* ── Toast notification ── */
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(timer);
  }, [notification]);

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
    else if (balanceFilter === "overdue") result = result.filter((c) => c.isOverdue);

    result.sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortBy) {
        case "currentBalance": va = parseFloat(a.currentBalance); vb = parseFloat(b.currentBalance); break;
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

  // Unbilled count from filtered data for KPI card
  const unbilledCustomerCount = useMemo(() => allCustomers.filter((c) => c.unbilledCount > 0).length, [allCustomers]);

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
        setNotification({ type: "success", message: "Customer updated" });
      } else {
        await apiFetch("/customers", { method: "POST", body: JSON.stringify(payload), token, locationId });
        setNotification({ type: "success", message: "Customer created" });
      }
      closeModal(); customerQuery.refetch(); summaryQuery.refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save customer";
      setSaveError(msg);
    } finally { setIsSaving(false); }
  };

  /* ── Batch SOA generation ── */
  const [batchSoaLoading, setBatchSoaLoading] = useState(false);
  const handleBatchSOA = async () => {
    const unbilledCustomers = customers.filter((c) => c.unbilledCount > 0);
    if (unbilledCustomers.length === 0) return;
    if (!confirm(`Generate SOAs for ${unbilledCustomers.length} customer${unbilledCustomers.length !== 1 ? "s" : ""} with unbilled charges?`)) return;

    setBatchSoaLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const to = now.toISOString().slice(0, 10);
      const res = await apiFetch<{ generated: number; errors: string[] }>("/customers/soa/batch-generate", {
        method: "POST", token, locationId,
        body: JSON.stringify({ customerIds: unbilledCustomers.map((c) => c.id), from, to, unbilledOnly: true }),
      });
      setNotification({ type: "success", message: `Generated ${res.generated} SOA${res.generated !== 1 ? "s" : ""}${res.errors?.length ? ` (${res.errors.length} failed)` : ""}` });
      customerQuery.refetch(); summaryQuery.refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate SOAs";
      setNotification({ type: "error", message: msg });
    } finally { setBatchSoaLoading(false); }
  };

  /* ── Collection list export ── */
  const handleCollectionList = () => {
    const withBalance = customers.filter((c) => parseFloat(c.currentBalance) > 0);
    if (withBalance.length === 0) return;
    const sorted = [...withBalance].sort((a, b) => parseFloat(b.currentBalance) - parseFloat(a.currentBalance));
    const totalCollectable = sorted.reduce((s, c) => s + parseFloat(c.currentBalance), 0);
    const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

    const rows = sorted.map((c) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:13px">${c.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:13px">${c.phone}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${fmtPeso(c.currentBalance)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:13px">${c.lastPaymentDate ? fmtDate(c.lastPaymentDate) : "Never"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;color:${c.isOverdue ? "#dc2626" : "#16a34a"}">${c.isOverdue ? "Overdue" : "Current"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-size:13px">${c.address || ""}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><title>Collection List - ${today}</title>
      <style>@media print { body { margin: 0; } } body { font-family: Arial, sans-serif; } table { width: 100%; border-collapse: collapse; }</style>
    </head><body style="padding:20px">
      <div style="text-align:center;margin-bottom:16px">
        <h2 style="margin:0;font-size:18px">CBROS Genuine Autoparts</h2>
        <h3 style="margin:4px 0 0;font-size:15px;font-weight:normal;color:#666">Collection List &mdash; ${today}</h3>
      </div>
      <div style="display:flex;gap:24px;margin-bottom:12px;font-size:13px;color:#555">
        <span><strong>Customers:</strong> ${sorted.length}</span>
        <span><strong>Total Collectable:</strong> ${fmtPeso(totalCollectable)}</span>
      </div>
      <table>
        <thead><tr style="background:#f5f5f5">
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d4d4d4">Customer</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d4d4d4">Code</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d4d4d4">Balance</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d4d4d4">Last Payment</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d4d4d4">Status</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d4d4d4">Address</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="font-weight:bold">
          <td style="padding:8px 10px;border-top:2px solid #d4d4d4" colspan="2">Total</td>
          <td style="padding:8px 10px;border-top:2px solid #d4d4d4;text-align:right;font-variant-numeric:tabular-nums">${fmtPeso(totalCollectable)}</td>
          <td colspan="3" style="padding:8px 10px;border-top:2px solid #d4d4d4"></td>
        </tr></tfoot>
      </table>
      <div style="margin-top:40px;display:flex;gap:80px;font-size:12px;color:#999">
        <div>Prepared by: _______________</div>
        <div>Collector: _______________</div>
        <div>Date: _______________</div>
      </div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
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

        {/* KPI cards — 4 columns */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard icon={<DollarSign size={12} />} label="Total Receivables" value={fmtPeso(summary?.totalReceivables ?? 0)}
            subtitle={`${fmtNum(summary?.customerCount ?? 0)} customers`}
            accent={summary ? summary.totalReceivables > 0 : false} />
          <KPICard icon={<AlertTriangle size={12} />} label="Overdue" value={fmtPeso(summary?.overdueAmount ?? 0)}
            subtitle={`${fmtNum(summary?.overdueCount ?? 0)} customers`}
            className="text-red-500" href="/customers/reports/aging" />
          <KPICard icon={<CheckCircle size={12} />} label="Current" value={fmtPeso(summary?.currentAmount ?? 0)}
            subtitle={`${fmtNum(summary?.currentCount ?? 0)} customers`}
            className="text-emerald-600" />
          <KPICard icon={<FileText size={12} />} label="Unbilled" value={`${fmtNum(unbilledCustomerCount)} customers`}
            subtitle={unbilledCustomerCount > 0 ? "Need SOA generation" : undefined} />
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

          {/* Balance / status filter */}
          <select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40">
            <option value="">All Customers</option>
            <option value="with_balance">With Balance</option>
            <option value="no_balance">No Balance</option>
            <option value="overdue">Overdue</option>
            <option value="unbilled">{"\u26A0"} Unbilled</option>
            <option value="fully_billed">{"\u2713"} Fully Billed</option>
            <option value="no_charges">No Charges</option>
          </select>

          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />

          {hasFilters && <button onClick={resetFilters} className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Reset</button>}

          {/* Export actions */}
          <div className="ml-auto flex items-center gap-1.5">
            {isManager && unbilledCustomerCount > 0 && (
              <button onClick={handleBatchSOA} disabled={batchSoaLoading}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <FileText size={12} /> {batchSoaLoading ? "Generating..." : `Generate ${unbilledCustomerCount} SOAs`}
              </button>
            )}
            {customers.length > 0 && (
              <>
                <button onClick={handleCollectionList}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <FileDown size={12} /> Collection List
                </button>
                <button onClick={() => downloadCSV("customers",
                  ["Name", "Type", "Code", "Balance", "Last Payment", "Status", "Terms"],
                  customers.map((c) => [
                    c.name, c.customerType, c.phone,
                    c.currentBalance,
                    c.lastPaymentDate ? fmtDate(c.lastPaymentDate) : "Never",
                    c.isOverdue ? "Overdue" : c.unbilledCount > 0 ? `${c.unbilledCount} unbilled` : c.totalChargeCount > 0 ? "Billed" : "—",
                    `${c.paymentTermsDays} days`,
                  ])
                )} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <Download size={12} /> CSV
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-3 py-2">
          <button onClick={() => handleSort("name")} className={cn("flex-1 flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", sortBy === "name" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            Customer {sortBy === "name" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
          </button>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Type</div>
          <button onClick={() => handleSort("currentBalance")} className={cn("w-32 flex items-center justify-end gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", sortBy === "currentBalance" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            Balance {sortBy === "currentBalance" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
          </button>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Last Payment</div>
          <div className="w-32 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Status</div>
          <div className="w-10" />
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
                <div key={c.id} className="flex w-full items-center px-3 py-1.5 text-left transition-colors hover:bg-accent/40">
                  <button onClick={() => {
                    const ref = c.matchedRef ? (() => { try { return JSON.parse(c.matchedRef); } catch { return null; } })() : null;
                    const highlight = ref?.number ? `?highlight=${encodeURIComponent(ref.number)}` : "";
                    router.push(`/customers/${c.id}${highlight}`);
                  }} className="flex-1 min-w-0 text-left">
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
                            {icon} {ref.number}{date ? ` \u2014 ${date}` : ""}{amt ? ` \u2014 ${amt}` : ""}
                          </span>
                        );
                      } catch { return null; }
                    })()}
                  </button>
                  <div className="w-24">
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold", TYPE_BADGES[c.customerType] ?? "bg-muted text-muted-foreground")}>
                      {c.customerType}
                    </span>
                  </div>
                  <div className="w-32 text-right">
                    <span className={cn("text-[12px] font-semibold tabular-nums", balance === 0 ? "text-emerald-600" : "text-red-600")}>
                      {fmtPeso(c.currentBalance)}
                    </span>
                  </div>
                  <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">
                    {c.lastPaymentDate ? timeAgo(c.lastPaymentDate) : "\u2014"}
                  </div>
                  <div className="w-32 text-center">
                    {balance === 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">{"\u2713"} Current</span>
                    ) : c.isOverdue ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600">{"\u26A0"} Overdue</span>
                    ) : c.unbilledCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600">{"\u26A0"} {c.unbilledCount} unbilled</span>
                    ) : c.totalChargeCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600">{"\u2713"} Billed</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">&mdash;</span>
                    )}
                  </div>
                  <CustomerRowActions
                    customer={c}
                    onEdit={() => setEditingCustomer(c)}
                    onNavigate={(path) => router.push(path)}
                  />
                </div>
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
                  <label className="text-xs font-medium text-muted-foreground">Phone / Code *</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="AR-XXXX or 0917..."
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

              <div>
                <label className="text-xs font-medium text-muted-foreground">TIN</label>
                <input type="text" value={form.tin} onChange={(e) => setForm((p) => ({ ...p, tin: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
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

      {/* Toast notification */}
      {notification && (
        <div className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2",
          notification.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
        )}>
          {notification.type === "success" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          <span className="text-[13px] font-medium">{notification.message}</span>
        </div>
      )}
    </div>
  );
}

/* ── KPI Card ── */
function KPICard({ icon, label, value, accent, className, subtitle, href }: {
  icon: React.ReactNode; label: string; value: string; accent?: boolean; className?: string; subtitle?: string; href?: string;
}) {
  const router = useRouter();
  return (
    <div
      onClick={href ? () => router.push(href) : undefined}
      className={cn(
        "rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        accent && "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20",
        href && "cursor-pointer hover:border-primary/30 hover:shadow-md transition-all",
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[11px] font-medium">{label}</span></div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums text-foreground", className)}>{value}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground/70">{subtitle}</div>}
    </div>
  );
}

/* ── Row Action Dropdown ── */
function CustomerRowActions({ customer, onEdit, onNavigate }: {
  customer: Customer; onEdit: () => void; onNavigate: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative w-10 flex justify-center">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setOpenUpward(window.innerHeight - rect.bottom < 160);
          }
          setOpen(!open);
        }}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className={cn(
          "absolute right-0 z-20 w-44 rounded-lg border border-border bg-background py-1 shadow-lg",
          openUpward ? "bottom-full mb-1" : "top-full mt-1",
        )}>
          <button onClick={(e) => { e.stopPropagation(); onNavigate(`/customers/${customer.id}`); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent">
            <Eye size={13} /> View Detail
          </button>
          <button onClick={(e) => { e.stopPropagation(); onNavigate(`/customers/${customer.id}?action=payment`); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent">
            <DollarSign size={13} /> Record Payment
          </button>
          {customer.unbilledCount > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onNavigate(`/customers/${customer.id}?tab=statement`); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent">
              <FileText size={13} /> Generate SOA
            </button>
          )}
          <div className="my-1 border-t border-border" />
          <button onClick={(e) => { e.stopPropagation(); onEdit(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent">
            <Pencil size={13} /> Edit Customer
          </button>
        </div>
      )}
    </div>
  );
}
