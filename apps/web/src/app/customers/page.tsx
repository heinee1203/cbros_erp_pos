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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useCustomerList,
  useARSummary,
  type Customer,
} from "@/hooks/use-customers-query";
import { apiFetch } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPeso(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `\u20B1${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_BADGES: Record<string, string> = {
  INDIVIDUAL: "bg-slate-500/10 text-slate-600",
  SHOP: "bg-blue-500/10 text-blue-600",
  FLEET: "bg-purple-500/10 text-purple-600",
  WHOLESALE: "bg-amber-500/10 text-amber-600",
};

const TYPE_OPTIONS = ["INDIVIDUAL", "SHOP", "FLEET", "WHOLESALE"] as const;

const PAYMENT_TERMS_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 15, label: "15 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
];

/* ------------------------------------------------------------------ */
/*  Modal form types                                                   */
/* ------------------------------------------------------------------ */

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
}

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  customerType: "INDIVIDUAL",
  contactPerson: "",
  email: "",
  address: "",
  tin: "",
  creditLimit: "0.00",
  paymentTermsDays: 30,
  notes: "",
};

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function CustomersPage() {
  const router = useRouter();
  const { token, locationId, user } = useAuth();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  /* ── State ── */
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  /* ── Debounce search ── */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /* ── Data ── */
  const customerQuery = useCustomerList(token, locationId, {
    search: debouncedSearch || undefined,
    type: typeFilter || undefined,
    limit: 50,
  });

  const summaryQuery = useARSummary(token, locationId);

  const customers = customerQuery.data?.data ?? [];
  const summary = summaryQuery.data;

  /* ── Modal state ── */
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
      });
    } else if (showCreateModal) {
      setForm(emptyForm);
    }
    setSaveError("");
  }, [editingCustomer, showCreateModal]);

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingCustomer(null);
    setForm(emptyForm);
    setSaveError("");
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        customerType: form.customerType,
        creditLimit: form.creditLimit,
        paymentTermsDays: form.paymentTermsDays,
      };
      if (form.contactPerson.trim()) payload.contactPerson = form.contactPerson.trim();
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.address.trim()) payload.address = form.address.trim();
      if (form.tin.trim()) payload.tin = form.tin.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      if (editingCustomer) {
        await apiFetch(`/customers/${editingCustomer.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          token,
          locationId,
        });
      } else {
        await apiFetch("/customers", {
          method: "POST",
          body: JSON.stringify(payload),
          token,
          locationId,
        });
      }

      closeModal();
      customerQuery.refetch();
      summaryQuery.refetch();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save customer");
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Loading skeleton ── */
  if (customerQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-6xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
              <Users size={16} className="text-primary" />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Customer List</h1>
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Users size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Customer List</h1>
        </div>
        {isManager && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} />
            New Customer
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* With Balance */}
        <div
          className={cn(
            "rounded-xl border border-border p-4 shadow-sm",
            summary && summary.customerCount > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-background"
          )}
        >
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <Users size={14} />
            With Balance
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {summary?.customerCount ?? "—"}
          </div>
          <div className="text-[11px] text-muted-foreground">customers</div>
        </div>

        {/* Total Receivables */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <DollarSign size={14} />
            Total Receivables
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {summary ? formatPeso(summary.totalReceivables) : "—"}
          </div>
        </div>

        {/* Overdue */}
        <div
          className={cn(
            "rounded-xl border border-border p-4 shadow-sm",
            summary && summary.overdueCount > 0
              ? "bg-red-50 border-red-200"
              : "bg-background"
          )}
        >
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <AlertTriangle size={14} />
            Overdue
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {summary?.overdueCount ?? "—"}{" "}
            <span className="text-sm font-normal text-muted-foreground">customers</span>
          </div>
          <div className="text-[12px] tabular-nums text-red-600">
            {summary ? formatPeso(summary.overdueAmount) : ""}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            style={{ paddingLeft: "2.125rem" }}
          />
        </div>

        {/* Type filter chips */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTypeFilter("")}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              !typeFilter
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            All
          </button>
          {(
            [
              { value: "INDIVIDUAL", label: "Individual", icon: User },
              { value: "SHOP", label: "Shop", icon: ShoppingBag },
              { value: "FLEET", label: "Fleet", icon: Truck },
              { value: "WHOLESALE", label: "Wholesale", icon: Building2 },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(typeFilter === t.value ? "" : t.value)}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                typeFilter === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Customer</div>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Type</div>
          <div className="w-32 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Phone</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Credit Limit</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Balance</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Last Activity</div>
        </div>

        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Users size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">
              {debouncedSearch || typeFilter
                ? "No customers matching your search."
                : "No customers yet. Create your first customer."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {customers.map((c) => {
              const balance = parseFloat(c.currentBalance);
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className="flex w-full items-center px-4 py-3 text-left transition-colors duration-100 hover:bg-accent/60 active:bg-accent"
                >
                  {/* Customer name */}
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{c.name}</span>
                    {c.contactPerson && (
                      <span className="block truncate text-[11px] text-muted-foreground">{c.contactPerson}</span>
                    )}
                  </div>

                  {/* Type badge */}
                  <div className="w-24">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
                        TYPE_BADGES[c.customerType] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      {c.customerType}
                    </span>
                  </div>

                  {/* Phone */}
                  <div className="w-32 text-[12px] text-muted-foreground truncate">
                    {c.phone || "—"}
                  </div>

                  {/* Credit Limit */}
                  <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">
                    {formatPeso(c.creditLimit)}
                  </div>

                  {/* Balance */}
                  <div className="w-28 text-right">
                    <span
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
                        balance === 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      )}
                    >
                      {formatPeso(c.currentBalance)}
                    </span>
                  </div>

                  {/* Last Activity */}
                  <div className="w-28 text-right text-[11px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">
            Showing {customers.length} customer{customers.length !== 1 ? "s" : ""}
          </span>
          {customerQuery.data?.hasMore && (
            <span className="text-[11px] text-muted-foreground">More results available</span>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{modalTitle}</h3>
              <button onClick={closeModal} className="rounded p-1 hover:bg-muted">
                <X size={16} />
              </button>
            </div>

            {saveError && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">
                {saveError}
              </div>
            )}

            <div className="space-y-3">
              {/* Name & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Customer name"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+63-XXX-XXX-XXXX"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Type & Contact Person */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Customer Type</label>
                  <select
                    value={form.customerType}
                    onChange={(e) => setForm((p) => ({ ...p, customerType: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contact Person</label>
                  <input
                    type="text"
                    value={form.contactPerson}
                    onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))}
                    placeholder="Point of contact"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Email & TIN */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">TIN</label>
                  <input
                    type="text"
                    value={form.tin}
                    onChange={(e) => setForm((p) => ({ ...p, tin: e.target.value }))}
                    placeholder="XXX-XXX-XXX-XXX"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Street, City, Province"
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              {/* Credit Limit & Payment Terms */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Credit Limit</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.creditLimit}
                    onChange={(e) => setForm((p) => ({ ...p, creditLimit: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Payment Terms</label>
                  <select
                    value={form.paymentTermsDays}
                    onChange={(e) => setForm((p) => ({ ...p, paymentTermsDays: parseInt(e.target.value, 10) }))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {PAYMENT_TERMS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.phone.trim() || isSaving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSaving
                  ? "Saving..."
                  : editingCustomer
                    ? "Save Changes"
                    : "Create Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
