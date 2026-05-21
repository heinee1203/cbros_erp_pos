"use client";

/**
 * Supplier workspace drawer.
 *
 * Opens over the Supplier List. Existing suppliers load Overview first, then
 * Details and server-backed activity tabs. New suppliers show the Details form
 * and POST to /ap/suppliers.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  X,
  Save,
  Loader2,
  FileText,
  History,
  CreditCard,
  CheckCircle2,
  Ban,
  Circle,
  RotateCw,
  Package,
  Undo2,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink,
  Printer,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";
import { buildSupplierSOAHtml } from "@/lib/supplier-soa-html";

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
  lastBankChangeAt: string | null;
  bankChangeCount: number;
  hasBankChangeHistory: boolean;
  bankVerifiedAt: string | null;
  bankVerifiedBy: string | null;
  bankVerifiedByName: string | null;
  bankVerificationStatus?: BankVerificationStatus;
  safety?: SupplierSafetyMetadata;
  duplicateWarnings?: SupplierDuplicateWarning[];
  riskBadges?: SupplierRiskBadge[];
}

interface DrawerProps {
  supplierId: string | null; // null = new supplier
  token: string;
  locationId: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "overview" | "details" | "invoices" | "pos" | "returns" | "soas" | "dvs" | "audit";
type ActivityKind = Exclude<Tab, "overview" | "details">;
type SortDir = "asc" | "desc";
type BankVerificationStatus = "missing" | "unverified" | "verified" | "needs_review";

interface SupplierCompletenessMissingField {
  key: string;
  label: string;
}

interface SupplierSafetyMetadata {
  score: number;
  isComplete: boolean;
  paymentReady: boolean;
  missingFields: SupplierCompletenessMissingField[];
}

interface SupplierDuplicateWarning {
  field: string;
  label: string;
  severity: "warning" | "critical";
  matchedSupplierId: string;
  matchedSupplierName: string;
}

interface SupplierRiskBadge {
  code: string;
  label: string;
  severity: "info" | "warning" | "critical";
}

interface SupplierAuditRow {
  id: string;
  userName: string | null;
  action: string;
  details: unknown;
  createdAt: string;
}

interface SupplierTabSummary {
  count: number;
  totalAmount: number;
}

interface SupplierOverview {
  supplier: SupplierDetail;
  tabSummaries: Record<ActivityKind, SupplierTabSummary>;
  aging: {
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    days90Plus: number;
    total: number;
    overdue: number;
    openCount: number;
  };
  availableCredits: {
    count: number;
    amount: number;
  };
  lastActivity: {
    last_po: { poNumber?: string; date?: string } | null;
    last_payment: { dvNumber?: string; date?: string; amount?: string } | null;
    last_soa: { soaNumber?: string; date?: string; balance?: string } | null;
  };
  paymentSafety: {
    bankVerificationStatus: BankVerificationStatus;
    lastBankChangeAt: string | null;
    bankChangeCount: number;
    bankVerifiedAt: string | null;
    bankVerifiedBy: string | null;
    bankVerifiedByName: string | null;
  };
  duplicateWarnings: SupplierDuplicateWarning[];
  recommendedAction: {
    code: string;
    label: string;
    tab?: Tab;
    href?: string;
  };
}

interface SupplierActivityResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  summary: SupplierTabSummary;
  statusOptions?: string[];
}

interface ActivityState<T = any> {
  data: T[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  page: number;
  pageSize: number;
  total: number;
  search: string;
  status: string;
  sort: string;
  dir: SortDir;
  summary: SupplierTabSummary | null;
  statusOptions: string[];
}

interface SupplierMergePreview {
  dryRun: boolean;
  merged: boolean;
  targetSupplierId: string;
  targetSupplierName: string;
  sourceSupplierId: string;
  sourceSupplierName: string;
  counts: {
    invoices: number;
    soas: number;
    dvs: number;
    checkVouchers: number;
    purchaseOrders: number;
    supplierReturns: number;
    productSuppliers: number;
  };
  conflicts: Array<{
    type: string;
    label: string;
    value: string;
  }>;
}

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

const ACTIVITY_KINDS = ["invoices", "pos", "returns", "soas", "dvs", "audit"] as const;

const ACTIVITY_DEFAULT_SORT: Record<ActivityKind, string> = {
  invoices: "invoiceDate",
  pos: "orderDate",
  returns: "createdAt",
  soas: "generatedAt",
  dvs: "paymentDate",
  audit: "createdAt",
};

const ACTIVITY_SORT_OPTIONS: Record<ActivityKind, Array<{ value: string; label: string }>> = {
  invoices: [
    { value: "invoiceDate", label: "Invoice date" },
    { value: "dueDate", label: "Due date" },
    { value: "invoiceNumber", label: "Invoice #" },
    { value: "balance", label: "Balance" },
    { value: "status", label: "Status" },
  ],
  pos: [
    { value: "orderDate", label: "Order date" },
    { value: "poNumber", label: "PO #" },
    { value: "total", label: "Total" },
    { value: "status", label: "Status" },
  ],
  returns: [
    { value: "createdAt", label: "Date" },
    { value: "rtvNumber", label: "RTV #" },
    { value: "creditAmount", label: "Credit" },
    { value: "status", label: "Status" },
  ],
  soas: [
    { value: "generatedAt", label: "Generated" },
    { value: "soaNumber", label: "SOA #" },
    { value: "totalBalance", label: "Balance" },
    { value: "status", label: "Status" },
  ],
  dvs: [
    { value: "paymentDate", label: "Payment date" },
    { value: "dvNumber", label: "DV #" },
    { value: "amount", label: "Amount" },
    { value: "status", label: "Status" },
  ],
  audit: [
    { value: "createdAt", label: "Date" },
    { value: "action", label: "Action" },
  ],
};

const ACTIVITY_STATUS_OPTIONS: Record<ActivityKind, string[]> = {
  invoices: ["OPEN", "PARTIALLY_PAID", "PAID", "VOIDED"],
  pos: ["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  returns: ["DRAFT", "SUBMITTED", "ACKNOWLEDGED", "CREDIT_RECEIVED", "CLOSED", "CANCELLED"],
  soas: ["GENERATED", "SENT", "VOID"],
  dvs: ["DRAFT", "PRINTED", "CONFIRMED", "VOIDED"],
  audit: ["SUPPLIER_CREATE", "SUPPLIER_UPDATE", "SUPPLIER_BANK_CHANGE", "SUPPLIER_BANK_VERIFY", "SUPPLIER_MERGE"],
};

const EMPTY_ACTIVITY_ACTION: Record<ActivityKind, { label: string; href: (supplierId: string) => string }> = {
  invoices: { label: "Record Invoice", href: (supplierId) => `/ap/invoices?supplierId=${encodeURIComponent(supplierId)}` },
  pos: { label: "Create PO", href: (supplierId) => `/procurement/purchase-orders/new?supplierId=${encodeURIComponent(supplierId)}` },
  returns: { label: "Create Return", href: (supplierId) => `/procurement/supplier-returns/new?supplierId=${encodeURIComponent(supplierId)}` },
  soas: { label: "Generate SOA", href: (supplierId) => `/ap/supplier-soa?supplierId=${encodeURIComponent(supplierId)}` },
  dvs: { label: "Create DV", href: (supplierId) => `/ap/disbursement-vouchers/new?supplierId=${encodeURIComponent(supplierId)}` },
  audit: { label: "View Audit", href: (supplierId) => `/ap/suppliers?open=${encodeURIComponent(supplierId)}` },
};

function createActivityState(): Record<ActivityKind, ActivityState> {
  return ACTIVITY_KINDS.reduce((acc, kind) => {
    acc[kind] = {
      data: [],
      loading: false,
      error: null,
      loaded: false,
      page: 1,
      pageSize: 25,
      total: 0,
      search: "",
      status: "",
      sort: ACTIVITY_DEFAULT_SORT[kind],
      dir: "desc",
      summary: null,
      statusOptions: ACTIVITY_STATUS_OPTIONS[kind],
    };
    return acc;
  }, {} as Record<ActivityKind, ActivityState>);
}

function compactPeso(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `\u20B1${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1_000) return `\u20B1${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return fmtPeso(value);
}

function tabLabel(label: string, summary?: SupplierTabSummary, mode: "count" | "amount" = "count") {
  if (!summary) return label;
  const metric = mode === "amount" && summary.totalAmount !== 0
    ? compactPeso(summary.totalAmount)
    : String(summary.count);
  return `${label} ${metric}`;
}

function bankStatusClass(status: BankVerificationStatus) {
  if (status === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "needs_review") return "border-red-200 bg-red-50 text-red-700";
  if (status === "unverified") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-muted bg-muted/40 text-muted-foreground";
}

function bankStatusLabel(status: BankVerificationStatus) {
  if (status === "verified") return "Verified";
  if (status === "needs_review") return "Needs review";
  if (status === "unverified") return "Unverified";
  return "Missing";
}

function termsLabel(days: number): string {
  return PAYMENT_TERMS.find((t) => t.value === days)?.label ?? `Net ${days}`;
}

function riskBadgeClass(severity: SupplierRiskBadge["severity"]) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    SUPPLIER_CREATE: "Supplier created",
    SUPPLIER_UPDATE: "Supplier updated",
    SUPPLIER_BANK_CHANGE: "Bank details changed",
    SUPPLIER_STATUS_CHANGE: "Supplier status changed",
    SUPPLIER_BULK_TERMS: "Bulk terms updated",
    SUPPLIER_BANK_VERIFY: "Bank profile verified",
    SUPPLIER_MERGE: "Supplier merged",
  };
  return labels[action] ?? action.replace(/_/g, " ");
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
  const [tab, setTab] = useState<Tab>(isNew ? "details" : "overview");
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [overview, setOverview] = useState<SupplierOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(!isNew);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [activityState, setActivityState] = useState<Record<ActivityKind, ActivityState>>(
    () => createActivityState(),
  );

  // Form state
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isActive, setIsActive] = useState(true);
  const [pendingActiveChange, setPendingActiveChange] = useState<boolean | null>(null);
  const [verifyingBank, setVerifyingBank] = useState(false);
  const [mergeWarning, setMergeWarning] = useState<SupplierDuplicateWarning | null>(null);
  const [mergePreview, setMergePreview] = useState<SupplierMergePreview | null>(null);
  const [mergeReason, setMergeReason] = useState("Duplicate supplier review");
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const tabSummaries = overview?.tabSummaries;

  const drawerTabs = useMemo(
    () => [
      { key: "overview" as Tab, label: "Overview", icon: ShieldCheck },
      { key: "details" as Tab, label: "Details", icon: FileText },
      { key: "invoices" as Tab, label: tabLabel("Invoices", tabSummaries?.invoices), icon: FileText },
      { key: "pos" as Tab, label: tabLabel("POs", tabSummaries?.pos, "amount"), icon: Package },
      { key: "returns" as Tab, label: tabLabel("Returns", tabSummaries?.returns, "amount"), icon: Undo2 },
      { key: "soas" as Tab, label: tabLabel("SOAs", tabSummaries?.soas, "amount"), icon: History },
      { key: "dvs" as Tab, label: tabLabel("DVs", tabSummaries?.dvs), icon: CreditCard },
      ...(canEdit ? [{ key: "audit" as Tab, label: tabLabel("Audit", tabSummaries?.audit), icon: ShieldCheck }] : []),
    ],
    [canEdit, tabSummaries],
  );

  // ── Load supplier on open ──
  const loadSupplier = useCallback(async () => {
    if (isNew || !supplierId) return;
    setLoading(true);
    setOverviewLoading(true);
    setError(null);
    setOverviewError(null);
    try {
      const overviewResult = await apiFetch<SupplierOverview>(`/ap/suppliers/${supplierId}/overview`, {
        token,
        locationId,
      });
      const detail = overviewResult.supplier;
      setOverview(overviewResult);
      setSupplier(detail);
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
      const message = err instanceof Error ? err.message : "Failed to load supplier";
      setError(message);
      setOverviewError(message);
    } finally {
      setLoading(false);
      setOverviewLoading(false);
    }
  }, [isNew, supplierId, token, locationId]);

  useEffect(() => {
    setTab(isNew ? "details" : "overview");
    setActivityState(createActivityState());
    setOverview(null);
    setOverviewError(null);
    setMergeWarning(null);
    setMergePreview(null);
    setMergeError(null);
    setMergeReason("Duplicate supplier review");
  }, [isNew, supplierId]);

  useEffect(() => {
    loadSupplier();
  }, [loadSupplier]);

  // ── Lazy-load tab data ──
  const loadActivity = useCallback(
    async (kind: ActivityKind, overrides: Partial<ActivityState> = {}) => {
      if (isNew || !supplierId) return;
      const current = activityState[kind];
      const next = { ...current, ...overrides };
      setActivityState((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], ...overrides, loading: true, error: null },
      }));
      try {
        const params = new URLSearchParams({
          kind,
          page: String(next.page),
          pageSize: String(next.pageSize),
          sort: next.sort,
          dir: next.dir,
        });
        if (next.search.trim()) params.set("search", next.search.trim());
        if (next.status.trim()) params.set("status", next.status.trim());
        const res = await apiFetch<SupplierActivityResponse<any>>(
          `/ap/suppliers/${supplierId}/activity?${params.toString()}`,
          { token, locationId },
        );
        setActivityState((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            ...overrides,
            data: res.data || [],
            page: res.page,
            pageSize: res.pageSize,
            total: res.total,
            summary: res.summary,
            statusOptions: res.statusOptions?.length ? res.statusOptions : prev[kind].statusOptions,
            loading: false,
            error: null,
            loaded: true,
          },
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load supplier activity";
        setActivityState((prev) => ({
          ...prev,
          [kind]: { ...prev[kind], ...overrides, loading: false, error: message },
        }));
      }
    },
    [activityState, isNew, supplierId, token, locationId],
  );

  useEffect(() => {
    if (!ACTIVITY_KINDS.includes(tab as ActivityKind)) return;
    const kind = tab as ActivityKind;
    const state = activityState[kind];
    if (!state.loaded && !state.loading) {
      loadActivity(kind);
    }
  }, [activityState, loadActivity, tab]);

  const updateActivityDraft = useCallback((kind: ActivityKind, patch: Partial<ActivityState>) => {
    setActivityState((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], ...patch },
    }));
  }, []);

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
    const cleanBankValue = (value: string | null | undefined) => value?.trim() || "";
    const bankChanged = !isNew && supplier
      ? cleanBankValue(form.bankName) !== cleanBankValue(supplier.bankName)
        || cleanBankValue(form.bankAccountNumber) !== cleanBankValue(supplier.bankAccountNumber)
        || cleanBankValue(form.bankAccountName) !== cleanBankValue(supplier.bankAccountName)
      : false;
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
      if (isNew) {
        onClose();
      } else {
        setActivityState(createActivityState());
        await loadSupplier();
        toast.success(bankChanged ? "Supplier saved. Bank verification needs review." : "Supplier saved");
      }
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

  const handleVerifyBank = async () => {
    if (isNew || !supplierId) return;
    setVerifyingBank(true);
    setError(null);
    try {
      await apiFetch(`/ap/suppliers/${supplierId}/verify-bank`, {
        method: "POST",
        token,
        locationId,
      });
      toast.success("Bank profile verified");
      await loadSupplier();
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to verify bank profile";
      toast.error(message);
      setError(message);
    } finally {
      setVerifyingBank(false);
    }
  };

  const previewMerge = async (warning: SupplierDuplicateWarning) => {
    if (!supplierId) return;
    setMergeWarning(warning);
    setMergePreview(null);
    setMergeError(null);
    setMergeLoading(true);
    try {
      const preview = await apiFetch<SupplierMergePreview>(`/ap/suppliers/${supplierId}/merge`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          sourceSupplierId: warning.matchedSupplierId,
          reason: mergeReason.trim() || "Duplicate supplier review",
          dryRun: true,
        }),
      });
      setMergePreview(preview);
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : "Failed to preview merge");
    } finally {
      setMergeLoading(false);
    }
  };

  const confirmMerge = async () => {
    if (!supplierId || !mergeWarning || !mergePreview || mergePreview.conflicts.length > 0) return;
    const reason = mergeReason.trim();
    if (!reason) {
      setMergeError("Merge reason is required");
      return;
    }
    setMergeLoading(true);
    setMergeError(null);
    try {
      await apiFetch(`/ap/suppliers/${supplierId}/merge`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          sourceSupplierId: mergeWarning.matchedSupplierId,
          reason,
          dryRun: false,
        }),
      });
      toast.success(`Merged ${mergePreview.sourceSupplierName}`);
      setMergeWarning(null);
      setMergePreview(null);
      setActivityState(createActivityState());
      await loadSupplier();
      onSaved();
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : "Failed to merge suppliers");
    } finally {
      setMergeLoading(false);
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
            {drawerTabs.map((t) => (
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
          ) : error && tab === "details" ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && tab === "overview" && (
            <OverviewTab
              overview={overview}
              loading={overviewLoading}
              error={overviewError}
              canEdit={canEdit}
              verifyingBank={verifyingBank}
              onRetry={loadSupplier}
              onVerifyBank={handleVerifyBank}
              onSelectTab={setTab}
              onMergeDuplicate={previewMerge}
            />
          )}

          {!loading && tab === "details" && (
            <EditForm
              form={form}
              setField={setField}
              canEdit={canEdit}
              error={error}
              supplier={supplier}
              paymentSafety={overview?.paymentSafety ?? null}
              verifyingBank={verifyingBank}
              onVerifyBank={handleVerifyBank}
            />
          )}
          {!loading && tab === "invoices" && supplierId && (
            <ActivityTabShell
              kind="invoices"
              state={activityState.invoices}
              onDraftChange={(patch) => updateActivityDraft("invoices", patch)}
              onReload={(patch) => loadActivity("invoices", patch)}
            >
              <InvoicesTab invoices={activityState.invoices.data as InvoiceLite[]} supplierId={supplierId} />
            </ActivityTabShell>
          )}
          {!loading && tab === "pos" && supplierId && (
            <ActivityTabShell
              kind="pos"
              state={activityState.pos}
              onDraftChange={(patch) => updateActivityDraft("pos", patch)}
              onReload={(patch) => loadActivity("pos", patch)}
            >
              <POsTab pos={activityState.pos.data as POLite[]} supplierId={supplierId} />
            </ActivityTabShell>
          )}
          {!loading && tab === "returns" && supplierId && (
            <ActivityTabShell
              kind="returns"
              state={activityState.returns}
              onDraftChange={(patch) => updateActivityDraft("returns", patch)}
              onReload={(patch) => loadActivity("returns", patch)}
            >
              <ReturnsTab returns={activityState.returns.data as ReturnLite[]} supplierId={supplierId} />
            </ActivityTabShell>
          )}
          {!loading && tab === "soas" && supplierId && (
            <ActivityTabShell
              kind="soas"
              state={activityState.soas}
              onDraftChange={(patch) => updateActivityDraft("soas", patch)}
              onReload={(patch) => loadActivity("soas", patch)}
            >
              <SOAsTab
                soas={activityState.soas.data as SupplierSOAHistoryRow[]}
                supplierId={supplierId}
                supplier={supplier}
                token={token}
                locationId={locationId}
              />
            </ActivityTabShell>
          )}
          {!loading && tab === "dvs" && supplierId && (
            <ActivityTabShell
              kind="dvs"
              state={activityState.dvs}
              onDraftChange={(patch) => updateActivityDraft("dvs", patch)}
              onReload={(patch) => loadActivity("dvs", patch)}
            >
              <DVsTab dvs={activityState.dvs.data as DVLite[]} supplierId={supplierId} />
            </ActivityTabShell>
          )}
          {!loading && tab === "audit" && (
            <ActivityTabShell
              kind="audit"
              state={activityState.audit}
              onDraftChange={(patch) => updateActivityDraft("audit", patch)}
              onReload={(patch) => loadActivity("audit", patch)}
            >
              <AuditTab rows={activityState.audit.data as SupplierAuditRow[]} supplierId={supplierId ?? ""} />
            </ActivityTabShell>
          )}
        </div>

        {/* Footer */}
        {tab === "details" && canEdit && (
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

      {mergeWarning && (
        <SupplierMergeDialog
          preview={mergePreview}
          warning={mergeWarning}
          reason={mergeReason}
          loading={mergeLoading}
          error={mergeError}
          onReasonChange={setMergeReason}
          onCancel={() => {
            setMergeWarning(null);
            setMergePreview(null);
            setMergeError(null);
          }}
          onRefresh={() => previewMerge(mergeWarning)}
          onConfirm={confirmMerge}
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

function OverviewTab({
  overview,
  loading,
  error,
  canEdit,
  verifyingBank,
  onRetry,
  onVerifyBank,
  onSelectTab,
  onMergeDuplicate,
}: {
  overview: SupplierOverview | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  verifyingBank: boolean;
  onRetry: () => void;
  onVerifyBank: () => void;
  onSelectTab: (tab: Tab) => void;
  onMergeDuplicate: (warning: SupplierDuplicateWarning) => void;
}) {
  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" /> Loading overview...
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <div className="font-medium">{error}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-destructive/30 px-3 py-1 text-xs font-semibold hover:bg-destructive/10"
        >
          <RotateCw size={12} /> Retry
        </button>
      </div>
    );
  }

  if (!overview) return null;

  const supplier = overview.supplier;
  const status = overview.paymentSafety.bankVerificationStatus;
  const recommended = overview.recommendedAction;
  const canVerify = canEdit && status !== "missing" && status !== "verified";
  const activity = overview.lastActivity;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <OverviewMetric label="Payable" value={fmtPeso(overview.aging.total)} detail={`${overview.aging.openCount} open invoice${overview.aging.openCount === 1 ? "" : "s"}`} tone={overview.aging.total > 0 ? "default" : "muted"} />
        <OverviewMetric label="Overdue" value={fmtPeso(overview.aging.overdue)} detail="Past due balance" tone={overview.aging.overdue > 0 ? "danger" : "muted"} />
        <OverviewMetric label="Credits" value={fmtPeso(overview.availableCredits.amount)} detail={`${overview.availableCredits.count} available`} tone={overview.availableCredits.amount > 0 ? "success" : "muted"} />
        <OverviewMetric label="Bank" value={bankStatusLabel(status)} detail={overview.paymentSafety.bankVerifiedAt ? `Verified ${fmtDate(overview.paymentSafety.bankVerifiedAt)}` : "Payment safety"} tone={status === "verified" ? "success" : status === "needs_review" ? "danger" : "warning"} />
      </div>

      <Section title="Recommended Action">
        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">{recommended.label}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Based on current payables, payment safety, and duplicate review flags.
            </div>
          </div>
          {recommended.tab ? (
            <button
              type="button"
              onClick={() => onSelectTab(recommended.tab!)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Open <ArrowRight size={12} />
            </button>
          ) : recommended.href ? (
            <Link
              href={recommended.href}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Open <ArrowRight size={12} />
            </Link>
          ) : null}
        </div>
      </Section>

      <Section title="Aging Buckets">
        <div className="space-y-2">
          <AgingRow label="Current" amount={overview.aging.current} total={overview.aging.total} />
          <AgingRow label="1-30 days" amount={overview.aging.days1To30} total={overview.aging.total} />
          <AgingRow label="31-60 days" amount={overview.aging.days31To60} total={overview.aging.total} />
          <AgingRow label="61-90 days" amount={overview.aging.days61To90} total={overview.aging.total} />
          <AgingRow label="90+ days" amount={overview.aging.days90Plus} total={overview.aging.total} danger />
        </div>
      </Section>

      <Section title="Payment Safety">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", bankStatusClass(status))}>
                {bankStatusLabel(status)}
              </span>
              <div className="text-[11px] text-muted-foreground">
                {status === "missing"
                  ? "Complete bank name, account number, and account name before verification."
                  : status === "verified"
                  ? `Verified by ${overview.paymentSafety.bankVerifiedByName ?? "AP"}${overview.paymentSafety.bankVerifiedAt ? ` on ${fmtDate(overview.paymentSafety.bankVerifiedAt)}` : ""}.`
                  : status === "needs_review"
                  ? "Bank details changed after verification and need AP review."
                  : "Bank details are complete but not verified yet."}
              </div>
            </div>
            {canVerify && (
              <button
                type="button"
                onClick={onVerifyBank}
                disabled={verifyingBank}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-200 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {verifyingBank ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Verify Bank
              </button>
            )}
          </div>
          {(overview.paymentSafety.lastBankChangeAt || overview.paymentSafety.bankChangeCount > 0) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-800">
              Last bank change: {overview.paymentSafety.lastBankChangeAt ? fmtDate(overview.paymentSafety.lastBankChangeAt) : "Not dated"}.
              {overview.paymentSafety.bankChangeCount > 0 ? ` ${overview.paymentSafety.bankChangeCount} change audit${overview.paymentSafety.bankChangeCount === 1 ? "" : "s"} recorded.` : ""}
            </div>
          )}
        </div>
      </Section>

      <Section title="Recent Activity">
        <div className="grid gap-2 sm:grid-cols-3">
          <ActivityFact label="Last PO" value={activity.last_po?.poNumber ?? "None"} detail={activity.last_po?.date ? fmtDate(activity.last_po.date) : "No purchase order"} />
          <ActivityFact label="Last Payment" value={activity.last_payment?.dvNumber ?? "None"} detail={activity.last_payment?.amount ? fmtPeso(activity.last_payment.amount) : "No payment"} />
          <ActivityFact label="Last SOA" value={activity.last_soa?.soaNumber ?? "None"} detail={activity.last_soa?.balance ? fmtPeso(activity.last_soa.balance) : "No SOA"} />
        </div>
      </Section>

      <Section title="Duplicate Review">
        {overview.duplicateWarnings.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
            No duplicate supplier warnings.
          </div>
        ) : (
          <div className="space-y-2">
            {overview.duplicateWarnings.map((warning) => (
              <div key={`${warning.field}-${warning.matchedSupplierId}`} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[12px] font-semibold text-amber-900">{warning.label}</div>
                  <div className="text-[11px] text-amber-800">
                    Matches {warning.matchedSupplierName}
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onMergeDuplicate(warning)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-300 px-3 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Review Merge <ArrowRight size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Supplier Snapshot">
        <div className="grid gap-2 text-[11px] sm:grid-cols-2">
          <SnapshotLine label="Terms" value={termsLabel(supplier.paymentTermsDays)} />
          <SnapshotLine label="Credit limit" value={fmtPeso(supplier.creditLimit)} />
          <SnapshotLine label="Contact" value={supplier.contactPerson || supplier.contactPhone || "Missing"} />
          <SnapshotLine label="TIN" value={supplier.tin || "Missing"} />
        </div>
      </Section>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "default" | "muted" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "danger"
          ? "border-red-200 bg-red-50"
          : tone === "success"
          ? "border-emerald-200 bg-emerald-50"
          : tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : tone === "muted"
          ? "border-border bg-muted/20"
          : "border-border bg-background",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function AgingRow({ label, amount, total, danger }: { label: string; amount: number; total: number; danger?: boolean }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (amount / total) * 100)) : 0;
  return (
    <div className="grid grid-cols-[74px_1fr_96px] items-center gap-2 text-[11px]">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", danger ? "bg-red-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <div className={cn("text-right font-semibold tabular-nums", danger && amount > 0 ? "text-red-700" : "text-foreground")}>
        {fmtPeso(amount)}
      </div>
    </div>
  );
}

function ActivityFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-[12px] font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function SnapshotLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-semibold text-foreground">{value}</span>
    </div>
  );
}

function SupplierMergeDialog({
  preview,
  warning,
  reason,
  loading,
  error,
  onReasonChange,
  onCancel,
  onRefresh,
  onConfirm,
}: {
  preview: SupplierMergePreview | null;
  warning: SupplierDuplicateWarning;
  reason: string;
  loading: boolean;
  error: string | null;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onRefresh: () => void;
  onConfirm: () => void;
}) {
  const counts: Array<[string, number]> = preview
    ? [
        ["Invoices", preview.counts.invoices],
        ["SOAs", preview.counts.soas],
        ["DVs", preview.counts.dvs],
        ["Check vouchers", preview.counts.checkVouchers],
        ["POs", preview.counts.purchaseOrders],
        ["Returns", preview.counts.supplierReturns],
        ["Product links", preview.counts.productSuppliers],
      ]
    : [];
  const hasConflicts = (preview?.conflicts.length ?? 0) > 0;
  const hasReason = reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2 text-amber-700">
          <AlertTriangle size={18} />
          <h2 className="text-lg font-semibold text-foreground">Review Supplier Merge</h2>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {warning.label}: {warning.matchedSupplierName}
        </div>
        <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/20 px-3 py-2 text-[12px]">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Target keeps the account</span>
            <span className="truncate font-semibold text-foreground">{preview?.targetSupplierName ?? "This supplier"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Source gets deactivated</span>
            <span className="truncate font-semibold text-foreground">{preview?.sourceSupplierName ?? warning.matchedSupplierName}</span>
          </div>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Records move from source into target. The source supplier remains inactive for audit history.
          </p>
        </div>

        {loading && !preview ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="mr-2 animate-spin" /> Calculating merge preview...
          </div>
        ) : preview ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {counts.map(([label, value]) => (
                <div key={label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="text-base font-bold tabular-nums text-foreground">{value}</div>
                </div>
              ))}
            </div>
            {hasConflicts ? (
              <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                <div className="font-semibold">Merge blocked by conflicts</div>
                {preview.conflicts.map((conflict) => (
                  <div key={`${conflict.type}-${conflict.value}`}>{conflict.label}</div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
                No conflicts found. Source supplier will be deactivated after reassignment.
              </div>
            )}
          </div>
        ) : null}

        <label className="mt-4 block text-[11px] font-semibold text-muted-foreground">
          Merge reason <span className="text-destructive">*</span>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] font-normal text-foreground outline-none focus:border-primary/40"
          />
        </label>

        {error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-between gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
          >
            <RotateCw size={12} /> Refresh Preview
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading || !preview || hasConflicts || !hasReason}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
              Merge
            </button>
          </div>
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
  supplier,
  paymentSafety,
  verifyingBank,
  onVerifyBank,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  canEdit: boolean;
  error: string | null;
  supplier: SupplierDetail | null;
  paymentSafety: SupplierOverview["paymentSafety"] | null;
  verifyingBank: boolean;
  onVerifyBank: () => void;
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
  const bankStatus = paymentSafety?.bankVerificationStatus ?? supplier?.bankVerificationStatus ?? "missing";
  const canVerifyBank = canEdit && bankReady && bankStatus !== "verified";

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

      {supplier?.safety && (
        <SafetySummary
          safety={supplier.safety}
          duplicateWarnings={supplier.duplicateWarnings ?? []}
          riskBadges={supplier.riskBadges ?? []}
          lastBankChangeAt={supplier.lastBankChangeAt}
        />
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
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", bankStatusClass(bankStatus))}>
              {bankStatusLabel(bankStatus)}
            </span>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {bankStatus === "verified"
                ? `Verified${paymentSafety?.bankVerifiedByName ? ` by ${paymentSafety.bankVerifiedByName}` : ""}${paymentSafety?.bankVerifiedAt ? ` on ${fmtDate(paymentSafety.bankVerifiedAt)}` : ""}.`
                : bankStatus === "needs_review"
                ? "Bank details changed after verification. Re-verify before payment release."
                : bankStatus === "unverified"
                ? "Complete bank details are saved but still need AP verification."
                : "Bank verification will be available after all bank fields are filled."}
            </div>
          </div>
          {canVerifyBank && (
            <button
              type="button"
              onClick={onVerifyBank}
              disabled={verifyingBank}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-200 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              {verifyingBank ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Verify Bank
            </button>
          )}
        </div>
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
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-800">
          <div className="font-semibold">Bank-change audit is active</div>
          <div>
            Changes to bank name, account number, or account name are logged for payment review
            {supplier?.lastBankChangeAt ? `; last recorded ${fmtDate(supplier.lastBankChangeAt)}.` : "."}
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

function SafetySummary({
  safety,
  duplicateWarnings,
  riskBadges,
  lastBankChangeAt,
}: {
  safety: SupplierSafetyMetadata;
  duplicateWarnings: SupplierDuplicateWarning[];
  riskBadges: SupplierRiskBadge[];
  lastBankChangeAt: string | null;
}) {
  return (
    <Section title="Safety Summary" hint="Shown before payment workflows">
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
          <div
            className={cn(
              "text-2xl font-bold tabular-nums",
              safety.score >= 90
                ? "text-emerald-700"
                : safety.score >= 70
                ? "text-amber-700"
                : "text-red-700",
            )}
          >
            {safety.score}%
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Complete
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {riskBadges.length === 0 ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                No safety flags
              </span>
            ) : (
              riskBadges.map((badge) => (
                <span
                  key={badge.code}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    riskBadgeClass(badge.severity),
                  )}
                >
                  {badge.label}
                </span>
              ))
            )}
          </div>
          {safety.missingFields.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Missing: {safety.missingFields.map((field) => field.label).join(", ")}
            </div>
          )}
          {duplicateWarnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <div className="font-semibold">Possible duplicate supplier records</div>
              {duplicateWarnings.map((warning) => (
                <div key={`${warning.field}-${warning.matchedSupplierId}`}>
                  {warning.label}: {warning.matchedSupplierName}
                </div>
              ))}
            </div>
          )}
          {lastBankChangeAt && (
            <div className="text-[11px] text-blue-700">
              Last bank change audit: {fmtDate(lastBankChangeAt)}
            </div>
          )}
        </div>
      </div>
    </Section>
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

function InvoicesTab({ invoices, supplierId }: { invoices: InvoiceLite[]; supplierId: string }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  if (invoices.length === 0) {
    const action = EMPTY_ACTIVITY_ACTION.invoices;
    return <EmptyTab message="No invoices recorded for this supplier." actionLabel={action.label} actionHref={action.href(supplierId)} />;
  }

  const copyInvoiceNumber = async (invoice: InvoiceLite) => {
    try {
      await navigator.clipboard.writeText(invoice.invoiceNumber);
      setCopiedId(invoice.id);
      window.setTimeout(() => setCopiedId((current) => (current === invoice.id ? null : current)), 1200);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <TabTable
      headers={["Invoice #", "Date", "Due", "Amount", "Balance", "Status", "Actions"]}
      aligns={["left", "left", "left", "right", "right", "center", "right"]}
    >
      {invoices.map((inv) => {
        const isCM = parseFloat(inv.totalAmount) < 0;
        const amt = fmtAmount(inv.totalAmount);
        const bal = fmtAmount(inv.balance);
        const payable = !isCM && parseFloat(inv.balance) > 0 && ["OPEN", "PARTIALLY_PAID"].includes(inv.status);
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
            <td className="px-3 py-1.5">
              <div className="flex items-center justify-end gap-1">
                <Link
                  href={`/ap/invoices?openInvoiceId=${encodeURIComponent(inv.id)}`}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                >
                  <ExternalLink size={10} /> View
                </Link>
                {payable && (
                  <Link
                    href={`/ap/invoices?openInvoiceId=${encodeURIComponent(inv.id)}&pay=1`}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    <CreditCard size={10} /> Pay
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => copyInvoiceNumber(inv)}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copiedId === inv.id ? <Check size={10} /> : <Copy size={10} />}
                  {copiedId === inv.id ? "Copied" : "Copy"}
                </button>
              </div>
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

function POsTab({ pos, supplierId }: { pos: POLite[]; supplierId: string }) {
  if (pos.length === 0) {
    const action = EMPTY_ACTIVITY_ACTION.pos;
    return <EmptyTab message="No purchase orders for this supplier." actionLabel={action.label} actionHref={action.href(supplierId)} />;
  }
  return (
    <TabTable
      headers={["PO #", "Date", "Items", "Total", "Status", "Actions"]}
      aligns={["left", "left", "right", "right", "center", "right"]}
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
          <td className="px-3 py-1.5 text-right">
            <Link
              href={`/procurement/purchase-orders/${po.poNumber}`}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
            >
              <ExternalLink size={10} /> Open
            </Link>
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

function ReturnsTab({ returns, supplierId }: { returns: ReturnLite[]; supplierId: string }) {
  if (returns.length === 0) {
    const action = EMPTY_ACTIVITY_ACTION.returns;
    return <EmptyTab message="No returns (RTVs) for this supplier." actionLabel={action.label} actionHref={action.href(supplierId)} />;
  }
  return (
    <TabTable
      headers={["RTV #", "Date", "Items", "Cost", "Credit", "Status", "Actions"]}
      aligns={["left", "left", "right", "right", "right", "center", "right"]}
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
          <td className="px-3 py-1.5 text-right">
            <Link
              href={`/procurement/supplier-returns/${r.id}`}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
            >
              <ExternalLink size={10} /> Open
            </Link>
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

function SOAsTab({
  soas,
  supplierId,
  supplier,
  token,
  locationId,
}: {
  soas: SupplierSOAHistoryRow[];
  supplierId: string;
  supplier: SupplierDetail | null;
  token: string;
  locationId: string;
}) {
  const [printingId, setPrintingId] = useState<string | null>(null);

  const handleReprint = async (soaId: string) => {
    setPrintingId(soaId);
    try {
      const snap = await apiFetch<any>(`/ap/supplier-soa/${soaId}`, { token, locationId });
      const html = buildSupplierSOAHtml({
        supplierName: snap.supplier?.name || supplier?.name || "Supplier",
        supplierAddress: snap.supplier?.address ?? supplier?.address ?? null,
        supplierContact: snap.supplier?.contactPerson ?? supplier?.contactPerson ?? null,
        supplierPhone: snap.supplier?.contactPhone ?? supplier?.contactPhone ?? null,
        supplierEmail: snap.supplier?.contactEmail ?? supplier?.contactEmail ?? null,
        supplierTin: snap.supplier?.tin ?? supplier?.tin ?? null,
        invoices: (snap.invoices || []).map((invoice: any) => ({
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          totalAmount: Number(invoice.totalAmount ?? 0),
          paidAmount: Number(invoice.paidAmount ?? 0),
          balance: Number(invoice.balance ?? 0),
        })),
        soaNumber: snap.soaNumber,
        generatedAt: snap.generatedAt,
        generatedByName: snap.generatedByName,
      });
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.onload = () => w.print();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reprint SOA");
    } finally {
      setPrintingId(null);
    }
  };

  if (soas.length === 0) {
    const action = EMPTY_ACTIVITY_ACTION.soas;
    return <EmptyTab message="No SOAs generated for this supplier yet." actionLabel={action.label} actionHref={action.href(supplierId)} />;
  }
  return (
    <TabTable
      headers={["SOA #", "Period", "Invoices", "Amount", "Balance", "Status", "Actions"]}
      aligns={["left", "left", "right", "right", "right", "center", "right"]}
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
          <td className="px-3 py-1.5">
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => handleReprint(s.id)}
                disabled={printingId === s.id}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {printingId === s.id ? <Loader2 size={10} className="animate-spin" /> : <Printer size={10} />}
                Reprint
              </button>
              {s.status !== "VOID" && (
                <Link
                  href={`/ap/disbursement-vouchers/new?soaId=${encodeURIComponent(s.id)}&supplierId=${encodeURIComponent(supplierId)}`}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <CreditCard size={10} /> Pay
                </Link>
              )}
            </div>
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
  PRINTED: "bg-blue-50 text-blue-600",
  CONFIRMED: "bg-emerald-50 text-emerald-600",
  APPROVED: "bg-blue-50 text-blue-600",
  RELEASED: "bg-emerald-50 text-emerald-600",
  VOIDED: "bg-red-50 text-red-600",
};

function DVsTab({ dvs, supplierId }: { dvs: DVLite[]; supplierId: string }) {
  if (dvs.length === 0) {
    const action = EMPTY_ACTIVITY_ACTION.dvs;
    return <EmptyTab message="No disbursement vouchers for this supplier yet." actionLabel={action.label} actionHref={action.href(supplierId)} />;
  }
  return (
    <TabTable
      headers={["DV #", "Payment Date", "Method", "Check #", "Amount", "Status", "Actions"]}
      aligns={["left", "left", "left", "left", "right", "center", "right"]}
    >
      {dvs.map((dv) => (
        <tr key={dv.id} className="border-t border-border/40">
          <td className="px-3 py-1.5">
            <Link
              href={`/ap/disbursement-vouchers?search=${encodeURIComponent(dv.dvNumber)}`}
              className="font-mono font-semibold text-primary hover:underline"
            >
              {dv.dvNumber}
            </Link>
          </td>
          <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(dv.paymentDate)}</td>
          <td className="px-3 py-1.5 text-muted-foreground">{dv.paymentMethod?.replace(/_/g, " ") ?? "\u2014"}</td>
          <td className="px-3 py-1.5 font-mono text-muted-foreground">{dv.checkNumber ?? "\u2014"}</td>
          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtPeso(dv.amount)}</td>
          <td className="px-3 py-1.5 text-center">
            <StatusBadge status={dv.status} colors={DV_STATUS_COLORS} />
          </td>
          <td className="px-3 py-1.5 text-right">
            <Link
              href={`/ap/disbursement-vouchers?search=${encodeURIComponent(dv.dvNumber)}`}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
            >
              <ExternalLink size={10} /> Open
            </Link>
          </td>
        </tr>
      ))}
    </TabTable>
  );
}

function AuditTab({ rows, supplierId }: { rows: SupplierAuditRow[]; supplierId: string }) {
  if (rows.length === 0) {
    const action = EMPTY_ACTIVITY_ACTION.audit;
    return <EmptyTab message="No supplier audit history yet." actionLabel={action.label} actionHref={action.href(supplierId)} />;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const isBankChange = row.action === "SUPPLIER_BANK_CHANGE";
        return (
          <div
            key={row.id}
            className={cn(
              "rounded-lg border p-3",
              isBankChange ? "border-blue-200 bg-blue-50/60" : "border-border bg-background",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-foreground">
                  {auditActionLabel(row.action)}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {fmtDate(row.createdAt)} by {row.userName ?? "System"}
                </div>
              </div>
              {isBankChange && (
                <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[9px] font-semibold text-blue-700">
                  Review before payment
                </span>
              )}
            </div>
            {row.details != null && (
              <pre className="mt-2 max-h-52 overflow-auto rounded-md bg-background/80 p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(row.details, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Shared tab components ─── */

function ActivityTabShell({
  kind,
  state,
  onDraftChange,
  onReload,
  children,
}: {
  kind: ActivityKind;
  state: ActivityState;
  onDraftChange: (patch: Partial<ActivityState>) => void;
  onReload: (patch?: Partial<ActivityState>) => void;
  children: React.ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  const title = kind === "pos" ? "POs" : kind.toUpperCase();

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    onReload({ page: 1, search: state.search });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={state.search}
                onChange={(event) => onDraftChange({ search: event.target.value })}
                placeholder={`Search ${title.toLowerCase()}...`}
                className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-[12px] outline-none focus:border-primary/40"
              />
            </div>
            <button
              type="submit"
              disabled={state.loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-background disabled:opacity-50"
            >
              Search
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={state.status}
              onChange={(event) => onReload({ page: 1, status: event.target.value })}
              disabled={state.loading}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none disabled:opacity-50"
            >
              <option value="">All statuses</option>
              {(state.statusOptions.length ? state.statusOptions : ACTIVITY_STATUS_OPTIONS[kind]).map((status) => (
                <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select
              value={state.sort}
              onChange={(event) => onReload({ page: 1, sort: event.target.value })}
              disabled={state.loading}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none disabled:opacity-50"
            >
              {ACTIVITY_SORT_OPTIONS[kind].map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onReload({ page: 1, dir: state.dir === "asc" ? "desc" : "asc" })}
              disabled={state.loading}
              className="rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold hover:bg-background disabled:opacity-50"
            >
              {state.dir === "asc" ? "Asc" : "Desc"}
            </button>
            <select
              value={state.pageSize}
              onChange={(event) => onReload({ page: 1, pageSize: Number(event.target.value) })}
              disabled={state.loading}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none disabled:opacity-50"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}/page</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onReload()}
              disabled={state.loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium hover:bg-background disabled:opacity-50"
            >
              <RotateCw size={12} className={state.loading ? "animate-spin" : ""} />
              Retry
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {state.total} row{state.total === 1 ? "" : "s"}
            {state.summary?.totalAmount ? ` - ${fmtPeso(state.summary.totalAmount)}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onReload({ page: Math.max(1, state.page - 1) })}
              disabled={state.loading || state.page <= 1}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-background disabled:opacity-40"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="tabular-nums">Page {state.page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => onReload({ page: Math.min(totalPages, state.page + 1) })}
              disabled={state.loading || state.page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-background disabled:opacity-40"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </div>
      )}

      {state.loading && state.data.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading {title.toLowerCase()}...
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function EmptyTab({
  message,
  actionLabel,
  actionHref,
}: {
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border py-10 text-center">
      <div className="text-[12px] italic text-muted-foreground">{message}</div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-muted"
        >
          {actionLabel} <ArrowRight size={12} />
        </Link>
      )}
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
