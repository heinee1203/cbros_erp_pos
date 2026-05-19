"use client";

/**
 * Supplier Detail / Edit drawer.
 *
 * Opens as a right-side drawer over the Supplier List. Supports two modes:
 *   - Edit mode (supplierId !== null): loads GET /ap/suppliers/:id and shows
 *     an editable form + read-only tabs for Invoices, POs, Returns, SOAs, DVs.
 *   - New mode (supplierId === null): shows an empty form. Submitting POSTs
 *     to /ap/suppliers and fires onSaved with the new row's id.
 *
 * Editing is gated on `canEdit`. Viewers see a read-only form.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  X,
  Save,
  Loader2,
  FileText,
  History,
  CreditCard,
  Ban,
  Circle,
  RotateCw,
  Package,
  Undo2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";

export interface SupplierDetail {
  id: string;
  name: string;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  tin: string | null;
  mnemonicCode: string | null;
  paymentTermsDays: number;
  creditLimit: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  notes: string | null;
  isActive: boolean;
  avgLeadTimeDays: number;
  createdAt: string;
  updatedAt: string;
}

interface DrawerProps {
  supplierId: string | null; // null = new supplier
  token: string;
  locationId: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "edit" | "invoices" | "pos" | "returns" | "soas" | "dvs";

const PAYMENT_TERMS = [
  { value: 0, label: "COD" },
  { value: 7, label: "Net 7" },
  { value: 15, label: "Net 15" },
  { value: 30, label: "Net 30" },
  { value: 45, label: "Net 45" },
  { value: 60, label: "Net 60" },
  { value: 90, label: "Net 90" },
  { value: 120, label: "Net 120" },
  { value: 150, label: "Net 150" },
  { value: 180, label: "Net 180" },
];

function termsLabel(days: number): string {
  return PAYMENT_TERMS.find((t) => t.value === days)?.label ?? `Net ${days}`;
}

interface FormState {
  name: string;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  tin: string | null;
  mnemonicCode: string | null;
  paymentTermsDays: number;
  creditLimit: number;
  avgLeadTimeDays: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  notes: string | null;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  contactPerson: null,
  contactPhone: null,
  contactEmail: null,
  address: null,
  tin: null,
  mnemonicCode: null,
  paymentTermsDays: 30,
  creditLimit: 0,
  avgLeadTimeDays: 0,
  bankName: null,
  bankAccountNumber: null,
  bankAccountName: null,
  notes: null,
  isActive: true,
};

/* ─── Supporting tab types ─── */

interface InvoiceLite {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  status: string;
}

interface SupplierSOAHistoryRow {
  id: string;
  soaNumber: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  invoiceCount: number;
  status: string;
}

interface DVLite {
  id: string;
  dvNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  checkNumber: string | null;
  status: string;
}

interface POLite {
  id: string;
  poNumber: string;
  orderDate: string;
  itemCount: number;
  totalCost: string;
  status: string;
}

interface ReturnLite {
  id: string;
  rtvNumber: string;
  createdAt: string;
  itemCount: number;
  totalCost: string;
  creditAmount: string;
  status: string;
}

/* ═══════════════════════════════════════════════════ */

export function SupplierDetailDrawer({
  supplierId,
  token,
  locationId,
  canEdit,
  onClose,
  onSaved,
}: DrawerProps) {
  const isNew = supplierId === null;
  const [tab, setTab] = useState<Tab>("edit");
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isActive, setIsActive] = useState(true);
  const [pendingActiveChange, setPendingActiveChange] = useState<boolean | null>(null);

  // Per-tab data
  const [invoices, setInvoices] = useState<InvoiceLite[]>([]);
  const [soas, setSoas] = useState<SupplierSOAHistoryRow[]>([]);
  const [dvs, setDvs] = useState<DVLite[]>([]);
  const [pos, setPos] = useState<POLite[]>([]);
  const [returns, setReturns] = useState<ReturnLite[]>([]);

  // ── Load supplier on open ──
  const loadSupplier = useCallback(async () => {
    if (isNew || !supplierId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await apiFetch<SupplierDetail>(`/ap/suppliers/${supplierId}`, {
        token,
        locationId,
      });
      setForm({
        name: detail.name,
        contactPerson: detail.contactPerson,
        contactPhone: detail.contactPhone,
        contactEmail: detail.contactEmail,
        address: detail.address,
        tin: detail.tin,
        mnemonicCode: detail.mnemonicCode,
        paymentTermsDays: detail.paymentTermsDays,
        creditLimit: detail.creditLimit,
        avgLeadTimeDays: detail.avgLeadTimeDays ?? 0,
        bankName: detail.bankName,
        bankAccountNumber: detail.bankAccountNumber,
        bankAccountName: detail.bankAccountName,
        notes: detail.notes,
        isActive: detail.isActive,
      });
      setIsActive(detail.isActive);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load supplier");
    } finally {
      setLoading(false);
    }
  }, [isNew, supplierId, token, locationId]);

  useEffect(() => {
    loadSupplier();
  }, [loadSupplier]);

  // ── Lazy-load tab data ──
  useEffect(() => {
    if (isNew || !supplierId) return;
    if (tab === "invoices" && invoices.length === 0) {
      apiFetch<{ data: InvoiceLite[] }>(
        `/ap/invoices?supplierId=${supplierId}&limit=100`,
        { token, locationId },
      )
        .then((res) => setInvoices(res.data || []))
        .catch(() => {});
    } else if (tab === "soas" && soas.length === 0) {
      apiFetch<{ data: SupplierSOAHistoryRow[] }>(
        `/ap/suppliers/${supplierId}/soa-history`,
        { token, locationId },
      )
        .then((res) => setSoas(res.data || []))
        .catch(() => {});
    } else if (tab === "dvs" && dvs.length === 0) {
      apiFetch<{ data: DVLite[] }>(
        `/ap/disbursement-vouchers?supplierId=${supplierId}&limit=100`,
        { token, locationId },
      )
        .then((res) => setDvs(res.data || []))
        .catch(() => {});
    } else if (tab === "pos" && pos.length === 0) {
      apiFetch<{ data: POLite[] }>(
        `/procurement/purchase-orders?supplierId=${supplierId}&limit=100`,
        { token, locationId },
      )
        .then((res) => setPos(res.data || []))
        .catch(() => {});
    } else if (tab === "returns" && returns.length === 0) {
      apiFetch<{ data: ReturnLite[] }>(
        `/supplier-returns?supplierId=${supplierId}&limit=100`,
        { token, locationId },
      )
        .then((res) => setReturns(res.data || []))
        .catch(() => {});
    }
  }, [tab, supplierId, isNew, token, locationId, invoices.length, soas.length, dvs.length, pos.length, returns.length]);

  // ── ESC to close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      if (pendingActiveChange !== null) {
        setPendingActiveChange(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pendingActiveChange, saving]);

  // ── Handlers ──
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Supplier name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        contactPerson: form.contactPerson?.trim() || null,
        contactPhone: form.contactPhone?.trim() || null,
        contactEmail: form.contactEmail?.trim() || null,
        address: form.address?.trim() || null,
        tin: form.tin?.trim() || null,
        mnemonicCode: form.mnemonicCode?.trim() || null,
        paymentTermsDays: form.paymentTermsDays,
        creditLimit: String(form.creditLimit || 0),
        avgLeadTimeDays: form.avgLeadTimeDays || 0,
        bankName: form.bankName?.trim() || null,
        bankAccountNumber: form.bankAccountNumber?.trim() || null,
        bankAccountName: form.bankAccountName?.trim() || null,
        notes: form.notes?.trim() || null,
        isActive,
      };
      if (isNew) {
        await apiFetch("/ap/suppliers", {
          method: "POST",
          token,
          locationId,
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/ap/suppliers/${supplierId}`, {
          method: "PATCH",
          token,
          locationId,
          body: JSON.stringify(payload),
        });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (isNew || !supplierId) return;
    setPendingActiveChange(!isActive);
  };

  const confirmToggleActive = async () => {
    if (isNew || !supplierId || pendingActiveChange === null) return;
    const next = pendingActiveChange;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/ap/suppliers/${supplierId}`, {
        method: "PATCH",
        token,
        locationId,
        body: JSON.stringify({ isActive: next }),
      });
      setIsActive(next);
      setPendingActiveChange(null);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={() => !saving && onClose()}
      />

      {/* Drawer panel */}
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
              <FileText size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-foreground">
                {isNew ? "Add Supplier" : form.name || "Supplier"}
              </h2>
              <div className="mt-0.5 flex items-center gap-2">
                {!isNew && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                      isActive
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Circle
                      size={6}
                      className={isActive ? "fill-emerald-600 text-emerald-600" : "fill-muted-foreground text-muted-foreground"}
                    />
                    {isActive ? "Active" : "Inactive"}
                  </span>
                )}
                {!isNew && form.mnemonicCode && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {form.mnemonicCode}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {!isNew && (
          <div className="flex items-center gap-1 border-b border-border px-3 py-1 overflow-x-auto">
            {([
              { key: "edit" as Tab, label: "Details", icon: FileText },
              { key: "invoices" as Tab, label: "Invoices", icon: FileText },
              { key: "pos" as Tab, label: "POs", icon: Package },
              { key: "returns" as Tab, label: "Returns", icon: Undo2 },
              { key: "soas" as Tab, label: "SOAs", icon: History },
              { key: "dvs" as Tab, label: "DVs", icon: CreditCard },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap",
                  tab === t.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <t.icon size={12} />
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 size={16} className="mr-2 animate-spin" /> Loading supplier...
            </div>
          ) : error && tab === "edit" ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && tab === "edit" && (
            <EditForm form={form} setField={setField} canEdit={canEdit} error={error} />
          )}
          {!loading && tab === "invoices" && <InvoicesTab invoices={invoices} />}
          {!loading && tab === "pos" && <POsTab pos={pos} />}
          {!loading && tab === "returns" && <ReturnsTab returns={returns} />}
          {!loading && tab === "soas" && <SOAsTab soas={soas} />}
          {!loading && tab === "dvs" && <DVsTab dvs={dvs} />}
        </div>

        {/* Footer */}
        {tab === "edit" && canEdit && (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-5 py-3">
            <div className="flex items-center gap-2">
              {!isNew && (
                <button
                  onClick={handleToggleActive}
                  disabled={saving}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                    isActive
                      ? "border-red-200 text-red-600 hover:bg-red-50"
                      : "border-emerald-200 text-emerald-600 hover:bg-emerald-50",
                  )}
                >
                  {isActive ? (
                    <><Ban size={12} /> Deactivate</>
                  ) : (
                    <><RotateCw size={12} /> Reactivate</>
                  )}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {isNew ? "Create" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {pendingActiveChange !== null && (
        <SupplierStatusDialog
          supplierName={form.name || "this supplier"}
          nextActive={pendingActiveChange}
          saving={saving}
          onCancel={() => setPendingActiveChange(null)}
          onConfirm={confirmToggleActive}
        />
      )}
    </div>
  );
}

/* ─── Edit form subcomponent ─── */

function SupplierStatusDialog({
  supplierName,
  nextActive,
  saving,
  onCancel,
  onConfirm,
}: {
  supplierName: string;
  nextActive: boolean;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const action = nextActive ? "Reactivate" : "Deactivate";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className={cn("mb-3 flex items-center gap-2", nextActive ? "text-emerald-600" : "text-destructive")}>
          <AlertTriangle size={18} />
          <h2 className="text-lg font-semibold text-foreground">{action} Supplier</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Supplier:</span>{" "}
            <span className="font-medium">{supplierName}</span>
          </div>
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {nextActive
              ? "This supplier will appear again in new PO, invoice, and payment workflows."
              : "Existing invoices, SOAs, DVs, POs, and returns stay intact. The supplier will be hidden from new workflows."}
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50",
              nextActive ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700",
            )}
          >
            {saving ? "Saving..." : `${action} Supplier`}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditForm({
  form,
  setField,
  canEdit,
  error,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  canEdit: boolean;
  error: string | null;
}) {
  const common =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:bg-muted/40 disabled:cursor-not-allowed";
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const missingBankFields = [
    !form.bankName?.trim() && "bank",
    !form.bankAccountNumber?.trim() && "account #",
    !form.bankAccountName?.trim() && "account name",
  ].filter(Boolean) as string[];
  const bankReady = missingBankFields.length === 0;

  const copyValue = async (field: string, value: string | null) => {
    const text = value?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1200);
    } catch {
      setCopiedField(null);
    }
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <Section title="Basic Info">
        <Field label="Supplier Name" required>
          <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} disabled={!canEdit} className={common} />
        </Field>
        <Grid2>
          <Field label="Contact Person">
            <input type="text" value={form.contactPerson ?? ""} onChange={(e) => setField("contactPerson", e.target.value || null)} disabled={!canEdit} className={common} />
          </Field>
          <Field label="Mnemonic Code" hint="2-letter (e.g. WE)">
            <input type="text" maxLength={2} value={form.mnemonicCode ?? ""} onChange={(e) => setField("mnemonicCode", e.target.value.toUpperCase() || null)} disabled={!canEdit} className={cn(common, "font-mono")} />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Phone">
            <input type="tel" value={form.contactPhone ?? ""} onChange={(e) => setField("contactPhone", e.target.value || null)} disabled={!canEdit} className={common} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.contactEmail ?? ""} onChange={(e) => setField("contactEmail", e.target.value || null)} disabled={!canEdit} className={common} />
          </Field>
        </Grid2>
        <Field label="Address">
          <textarea rows={2} value={form.address ?? ""} onChange={(e) => setField("address", e.target.value || null)} disabled={!canEdit} className={common} />
        </Field>
        <Field label="TIN">
          <input type="text" value={form.tin ?? ""} onChange={(e) => setField("tin", e.target.value || null)} disabled={!canEdit} className={common} />
        </Field>
      </Section>

      <Section title="Credit Terms">
        <Grid2>
          <Field label="Payment Terms">
            <select value={form.paymentTermsDays} onChange={(e) => setField("paymentTermsDays", parseInt(e.target.value, 10))} disabled={!canEdit} className={common}>
              {PAYMENT_TERMS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Credit Limit" hint="0 = unlimited">
            <input type="number" min={0} step="0.01" value={form.creditLimit} onChange={(e) => setField("creditLimit", parseFloat(e.target.value) || 0)} disabled={!canEdit} className={common} />
          </Field>
        </Grid2>
        <Field label="Avg Lead Time (days)" hint="Typical delivery time from order to receipt">
          <input type="number" min={0} value={form.avgLeadTimeDays} onChange={(e) => setField("avgLeadTimeDays", parseInt(e.target.value, 10) || 0)} disabled={!canEdit} className={common} />
        </Field>
      </Section>

      <Section title="Bank Details" hint="Used to auto-fill disbursement vouchers">
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-[11px] leading-5",
            bankReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          <div className="font-semibold">
            {bankReady ? "Payment profile ready" : "Payment profile needs attention"}
          </div>
          <div>
            {bankReady
              ? `${termsLabel(form.paymentTermsDays)} terms and complete bank details are available for voucher prep.`
              : `Missing ${missingBankFields.join(", ")}. Fill these before using bank transfer or releasing payment.`}
          </div>
        </div>
        <Field label="Bank Name">
          <input type="text" value={form.bankName ?? ""} onChange={(e) => setField("bankName", e.target.value || null)} disabled={!canEdit} className={common} />
        </Field>
        <Grid2>
          <Field label="Account Number">
            <input type="text" value={form.bankAccountNumber ?? ""} onChange={(e) => setField("bankAccountNumber", e.target.value || null)} disabled={!canEdit} className={cn(common, "font-mono")} />
          </Field>
          <Field label="Account Name">
            <input type="text" value={form.bankAccountName ?? ""} onChange={(e) => setField("bankAccountName", e.target.value || null)} disabled={!canEdit} className={common} />
          </Field>
        </Grid2>
        <div className="flex flex-wrap gap-2">
          <CopyButton label="Bank" value={form.bankName} copied={copiedField === "bank"} onCopy={() => copyValue("bank", form.bankName)} />
          <CopyButton label="Account #" value={form.bankAccountNumber} copied={copiedField === "accountNumber"} onCopy={() => copyValue("accountNumber", form.bankAccountNumber)} />
          <CopyButton label="Account Name" value={form.bankAccountName} copied={copiedField === "accountName"} onCopy={() => copyValue("accountName", form.bankAccountName)} />
        </div>
      </Section>

      <Section title="Notes">
        <textarea rows={3} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value || null)} disabled={!canEdit} className={common} placeholder="Internal notes about this supplier..." />
      </Section>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-baseline justify-between text-[11px] font-medium text-muted-foreground">
        <span>{label}{required && <span className="ml-0.5 text-red-500">*</span>}</span>
        {hint && <span className="text-[9px] text-muted-foreground/70">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function CopyButton({
  copied,
  label,
  onCopy,
  value,
}: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  value: string | null;
}) {
  const disabled = !value?.trim();
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/50"
          : copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? `Copied ${label}` : `Copy ${label}`}
    </button>
  );
}

/* ═════════════════════════════════════════════════════
 *   Tab: Invoices
 * ═════════════════════════════════════════════════════ */

const INVOICE_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
  VOIDED: "bg-muted text-muted-foreground",
};

function fmtAmount(v: string): { text: string; isNeg: boolean } {
  const n = parseFloat(v);
  if (isNaN(n)) return { text: "—", isNeg: false };
  if (n < 0) return { text: `(${fmtPeso(String(Math.abs(n)))})`, isNeg: true };
  return { text: fmtPeso(v), isNeg: false };
}

function InvoicesTab({ invoices }: { invoices: InvoiceLite[] }) {
  if (invoices.length === 0) {
    return <EmptyTab message="No invoices recorded for this supplier." />;
  }
  // Sort newest first (Date DESC)
  const sorted = [...invoices].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  return (
    <TabTable
      headers={["Invoice #", "Date", "Due", "Amount", "Balance", "Status"]}
      aligns={["left", "left", "left", "right", "right", "center"]}
    >
      {sorted.map((inv) => {
        const isCM = parseFloat(inv.totalAmount) < 0;
        const amt = fmtAmount(inv.totalAmount);
        const bal = fmtAmount(inv.balance);
        return (
          <tr key={inv.id} className={`border-t border-border/40 ${isCM ? "bg-blue-50/30" : ""}`}>
            <td className="px-3 py-1.5 font-mono font-semibold text-foreground">
              {inv.invoiceNumber}
              {isCM && <span className="ml-1.5 inline-flex rounded bg-purple-100 px-1.5 py-px text-[9px] font-bold text-purple-700">CM</span>}
            </td>
            <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(inv.invoiceDate)}</td>
            <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(inv.dueDate)}</td>
            <td className={`px-3 py-1.5 text-right tabular-nums ${amt.isNeg ? "text-red-600 font-medium" : ""}`}>{amt.text}</td>
            <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${bal.isNeg ? "text-red-600" : ""}`}>{bal.text}</td>
            <td className="px-3 py-1.5 text-center">
              <StatusBadge status={inv.status} colors={INVOICE_STATUS_COLORS} />
            </td>
          </tr>
        );
      })}
    </TabTable>
  );
}

/* ═════════════════════════════════════════════════════
 *   Tab: POs (Purchase Orders)
 * ═════════════════════════════════════════════════════ */

const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-50 text-blue-600",
  PARTIALLY_RECEIVED: "bg-amber-50 text-amber-700",
  RECEIVED: "bg-emerald-50 text-emerald-600",
  CANCELLED: "bg-red-50 text-red-600",
};

function POsTab({ pos }: { pos: POLite[] }) {
  if (pos.length === 0) {
    return <EmptyTab message="No purchase orders for this supplier." />;
  }
  return (
    <TabTable
      headers={["PO #", "Date", "Items", "Total", "Status"]}
      aligns={["left", "left", "right", "right", "center"]}
    >
      {pos.map((po) => (
        <tr key={po.id} className="border-t border-border/40">
          <td className="px-3 py-1.5">
            <Link href={`/procurement/purchase-orders/${po.poNumber}`} className="font-mono font-semibold text-primary hover:underline">
              {po.poNumber}
            </Link>
          </td>
          <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(po.orderDate)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{po.itemCount}</td>
          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtPeso(po.totalCost)}</td>
          <td className="px-3 py-1.5 text-center">
            <StatusBadge status={po.status} colors={PO_STATUS_COLORS} />
          </td>
        </tr>
      ))}
    </TabTable>
  );
}

/* ═════════════════════════════════════════════════════
 *   Tab: Returns (RTVs)
 * ═════════════════════════════════════════════════════ */

const RTV_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-50 text-blue-600",
  APPROVED: "bg-emerald-50 text-emerald-600",
  CREDITED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-50 text-red-600",
};

function ReturnsTab({ returns }: { returns: ReturnLite[] }) {
  if (returns.length === 0) {
    return <EmptyTab message="No returns (RTVs) for this supplier." />;
  }
  return (
    <TabTable
      headers={["RTV #", "Date", "Items", "Cost", "Credit", "Status"]}
      aligns={["left", "left", "right", "right", "right", "center"]}
    >
      {returns.map((r) => (
        <tr key={r.id} className="border-t border-border/40">
          <td className="px-3 py-1.5">
            <Link href={`/procurement/supplier-returns/${r.id}`} className="font-mono font-semibold text-primary hover:underline">
              {r.rtvNumber}
            </Link>
          </td>
          <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(r.createdAt)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.itemCount}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{fmtPeso(r.totalCost)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtPeso(r.creditAmount)}</td>
          <td className="px-3 py-1.5 text-center">
            <StatusBadge status={r.status} colors={RTV_STATUS_COLORS} />
          </td>
        </tr>
      ))}
    </TabTable>
  );
}

/* ═════════════════════════════════════════════════════
 *   Tab: SOA History
 * ═════════════════════════════════════════════════════ */

const SOA_STATUS_COLORS: Record<string, string> = {
  GENERATED: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-50 text-blue-600",
  VOID: "bg-red-50 text-red-600",
};

function SOAsTab({ soas }: { soas: SupplierSOAHistoryRow[] }) {
  if (soas.length === 0) {
    return <EmptyTab message="No SOAs generated for this supplier yet." />;
  }
  return (
    <TabTable
      headers={["SOA #", "Period", "Invoices", "Amount", "Balance", "Status"]}
      aligns={["left", "left", "right", "right", "right", "center"]}
    >
      {soas.map((s) => (
        <tr key={s.id} className={cn("border-t border-border/40", s.status === "VOID" && "opacity-50")}>
          <td className="px-3 py-1.5 font-mono font-semibold text-foreground">{s.soaNumber}</td>
          <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(s.dateFrom)} – {fmtDate(s.dateTo)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{s.invoiceCount}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{fmtPeso(s.totalAmount)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtPeso(s.totalBalance)}</td>
          <td className="px-3 py-1.5 text-center">
            <StatusBadge status={s.status} colors={SOA_STATUS_COLORS} />
          </td>
        </tr>
      ))}
    </TabTable>
  );
}

/* ═════════════════════════════════════════════════════
 *   Tab: Disbursement Vouchers
 * ═════════════════════════════════════════════════════ */

const DV_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  APPROVED: "bg-blue-50 text-blue-600",
  RELEASED: "bg-emerald-50 text-emerald-600",
  VOIDED: "bg-red-50 text-red-600",
};

function DVsTab({ dvs }: { dvs: DVLite[] }) {
  if (dvs.length === 0) {
    return <EmptyTab message="No disbursement vouchers for this supplier yet." />;
  }
  return (
    <TabTable
      headers={["DV #", "Payment Date", "Method", "Check #", "Amount", "Status"]}
      aligns={["left", "left", "left", "left", "right", "center"]}
    >
      {dvs.map((dv) => (
        <tr key={dv.id} className="border-t border-border/40">
          <td className="px-3 py-1.5 font-mono font-semibold text-primary">{dv.dvNumber}</td>
          <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(dv.paymentDate)}</td>
          <td className="px-3 py-1.5 text-muted-foreground">{dv.paymentMethod?.replace(/_/g, " ") ?? "\u2014"}</td>
          <td className="px-3 py-1.5 font-mono text-muted-foreground">{dv.checkNumber ?? "\u2014"}</td>
          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtPeso(dv.amount)}</td>
          <td className="px-3 py-1.5 text-center">
            <StatusBadge status={dv.status} colors={DV_STATUS_COLORS} />
          </td>
        </tr>
      ))}
    </TabTable>
  );
}

/* ─── Shared tab components ─── */

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-[12px] italic text-muted-foreground">
      {message}
    </div>
  );
}

function TabTable({ headers, aligns, children }: { headers: string[]; aligns: ("left" | "right" | "center")[]; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-muted/40">
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={cn("px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", `text-${aligns[i]}`)}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  return (
    <span className={cn("inline-block rounded-md px-1.5 py-0.5 text-[9px] font-semibold", colors[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
