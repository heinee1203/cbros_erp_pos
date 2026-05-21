"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  FileText,
  AlertTriangle,
  X,
  Loader2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useCustomer,
  useCustomerCollectionNotes,
  useCustomerDisputes,
  useCustomerDocuments,
  useCustomerTimeline,
  useCustomerTransactions,
  useSOA,
  type Customer,
  type CustomerCollectionNote,
  type CustomerDocumentRow,
  type CustomerDispute,
  type CustomerMergePreview,
  type CustomerPaymentAllocationDetail,
  type CustomerPaymentReversalPreview,
  type CustomerTimelineEvent,
  type CustomerTransaction,
} from "@/hooks/use-customers-query";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { buildSOAHtml } from "@/lib/soa-html";
import { buildConsolidatedBillingHtml } from "@/lib/consolidated-billing-html";
import { buildSOARemainingHtml } from "@/lib/soa-remaining-html";
import { buildCollectionSummaryHtml, type CollectionPayment } from "@/lib/soa-collection-summary-html";
import { buildPaymentReceiptHtml, type PaymentReceiptData } from "@/lib/payment-receipt-html";

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
  "CREDIT_CARD",
  "GCASH",
  "MAYA",
  "QRPH",
  "OTHER",
] as const;

const CARD_TYPES = ["Visa", "Mastercard", "JCB", "Amex"] as const;

const CUSTOMER_TAB_KEYS = [
  "transactions",
  "sales",
  "statement",
  "collections",
  "documents",
  "timeline",
  "soa-history",
  "payments",
  "credit-memos",
] as const;
type CustomerTabKey = typeof CUSTOMER_TAB_KEYS[number];
type CustomerSOAPrintMode = "detailed" | "concise";
type SoaHistoryPendingAction =
  | { kind: "void"; record: any }
  | { kind: "undo-sent"; record: any }
  | { kind: "undo-paid"; record: any };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function normalizeCustomerTab(value: string | null): CustomerTabKey | null {
  return CUSTOMER_TAB_KEYS.includes(value as CustomerTabKey) ? (value as CustomerTabKey) : null;
}

function moneyValue(value: string | number | null | undefined): number {
  const numeric = typeof value === "number" ? value : parseFloat(value || "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

function hasRecentCustomerPayment(date: string | null | undefined, maxAgeDays = 60): boolean {
  if (!date) return false;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return false;
  return (Date.now() - timestamp) / 86_400_000 <= maxAgeDays;
}

function missingCustomerProfileFields(customer: Customer): string[] {
  const missing: string[] = [];
  if (!customer.phone?.trim()) missing.push("phone/code");
  if (!customer.address?.trim()) missing.push("address");
  if (!customer.tin?.trim()) missing.push("TIN");
  if (customer.customerType !== "INDIVIDUAL" && !customer.contactPerson?.trim()) missing.push("contact person");
  return missing;
}

function tabBadgeClass(tone: "default" | "warning" | "muted" | "success" = "default"): string {
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  if (tone === "success") return "bg-emerald-100 text-emerald-700";
  if (tone === "muted") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

function salesPaymentStatus(tx: CustomerTransaction): { label: string; classes: string } {
  if (tx.paymentStatus === "PAID") return { label: "Paid", classes: "bg-emerald-100 text-emerald-700" };
  if (tx.paymentStatus === "PARTIAL") return { label: "Partial", classes: "bg-amber-100 text-amber-700" };
  if (tx.billed) return { label: "Billed", classes: "bg-blue-100 text-blue-700" };
  return { label: "Unbilled", classes: "bg-orange-100 text-orange-700" };
}

function isCustomerCreditMemoLike(tx: { type?: string; notes?: string | null }): boolean {
  return tx.type === "CREDIT_NOTE" || (tx.type === "ADJUSTMENT" && /^Credit Memo\b/i.test(tx.notes ?? ""));
}

function creditMemoNumber(tx: { referenceNumber?: string | null; notes?: string | null }): string {
  const match = (tx.notes ?? "").match(/Credit Memo\s+([^\s.]+)/i);
  return tx.referenceNumber || match?.[1] || "\u2014";
}

function creditMemoInvoiceRef(notes: string | null | undefined): string | null {
  const match = (notes ?? "").match(/against invoice\s+([^.\]]+)/i);
  return match?.[1]?.trim() || null;
}

function creditMemoStatus(tx: { type?: string; billed?: boolean | null }): { label: string; classes: string } {
  if (tx.type === "ADJUSTMENT") return { label: "Used / Settled", classes: "bg-slate-100 text-slate-700" };
  if (tx.billed) return { label: "Applied in SOA", classes: "bg-blue-100 text-blue-700" };
  return { label: "Available for SOA", classes: "bg-emerald-100 text-emerald-700" };
}

/* ------------------------------------------------------------------ */
/*  Debit / Credit helpers for transaction rows                       */
/* ------------------------------------------------------------------ */

function isDebit(tx: CustomerTransaction): boolean {
  if (tx.type === "CHARGE") return true;
  if (tx.type === "ADJUSTMENT" && parseFloat(tx.amount) > 0) return true;
  return false;
}

function extractSoaRefs(notes: string | null | undefined): string[] {
  const match = (notes ?? "").match(/\[SOA:\s*([^\]]+)\]/);
  if (!match?.[1]) return [];
  return match[1].split(",").map((value) => value.trim()).filter(Boolean);
}

function transactionMatchesStatusFilter(tx: CustomerTransaction, filter: string): boolean {
  if (!filter) return true;
  if (filter === "unbilled") return tx.type === "CHARGE" && !tx.billed;
  if (filter === "billed") return tx.type === "CHARGE" && Boolean(tx.billed);
  if (filter === "paid") return tx.type === "CHARGE" && tx.paymentStatus === "PAID";
  if (filter === "partial") return tx.type === "CHARGE" && tx.paymentStatus === "PARTIAL";
  if (filter === "unpaid") return tx.type === "CHARGE" && (!tx.paymentStatus || tx.paymentStatus === "UNPAID");
  if (filter === "credit_memo") return isCustomerCreditMemoLike(tx);
  if (filter === "payment") return tx.type === "PAYMENT";
  return true;
}

function invoiceWarningBadges(tx: CustomerTransaction, rows: CustomerTransaction[]) {
  const warnings: Array<{ label: string; className: string }> = [];
  const ref = tx.referenceNumber?.trim();
  if (!ref) warnings.push({ label: "Missing reference", className: "border-amber-300 bg-amber-100 text-amber-950" });
  if (ref && rows.filter((row) => row.id !== tx.id && row.referenceNumber?.trim()?.toLowerCase() === ref.toLowerCase()).length > 0) {
    warnings.push({ label: "Duplicate reference", className: "border-red-300 bg-red-100 text-red-900" });
  }
  if (Math.abs(moneyValue(tx.amount)) <= 0.01) {
    warnings.push({ label: "Amount anomaly", className: "border-red-300 bg-red-100 text-red-900" });
  }
  const ageDays = (Date.now() - new Date(tx.recordedAt).getTime()) / 86_400_000;
  if (tx.paymentStatus !== "PAID" && ageDays > 90) {
    warnings.push({ label: "Old unpaid", className: "border-red-300 bg-red-100 text-red-900" });
  }
  if (tx.paymentStatus === "PARTIAL") {
    warnings.push({ label: "Partial", className: "border-blue-300 bg-blue-100 text-blue-900" });
  }
  if (!tx.billed) {
    warnings.push({ label: "Unbilled", className: "border-orange-300 bg-orange-100 text-orange-900" });
  }
  return warnings;
}

function buildConciseCustomerSOAHtml(data: {
  customer: Customer;
  transactions: CustomerTransaction[];
  from: string;
  to: string;
  soaNumber?: string;
}) {
  const escapeHtml = (value: string | null | undefined) =>
    (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const charges = data.transactions.filter((tx) => tx.type === "CHARGE");
  const credits = data.transactions.filter((tx) => tx.type === "CREDIT_NOTE" || tx.type === "PAYMENT" || (tx.type === "ADJUSTMENT" && moneyValue(tx.amount) < 0));
  const chargeTotal = charges.reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0);
  const creditTotal = credits.reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0);
  const rows = charges.map((tx) => `
    <tr>
      <td>${formatDate(tx.recordedAt)}</td>
      <td>${escapeHtml(tx.referenceNumber || tx.notes || "Charge")}</td>
      <td class="right">${formatPeso(Math.abs(moneyValue(tx.amount)))}</td>
    </tr>
  `).join("");
  const creditRows = credits.length > 0
    ? `<div class="credits"><strong>Credits / payments applied:</strong> ${formatPeso(creditTotal)}</div>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Customer SOA - ${escapeHtml(data.customer.name)}</title>
<style>
@page { size: letter portrait; margin: 16mm; }
body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
.page { min-height: 245mm; display: flex; flex-direction: column; }
.hdr { text-align: center; font-family: Georgia, serif; font-weight: 900; font-size: 18pt; letter-spacing: .08em; }
.sub { text-align: center; font-weight: 800; font-size: 13pt; margin-top: 4px; }
.grid { display: grid; grid-template-columns: 1fr 250px; gap: 14px; margin-top: 22px; }
.box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; min-height: 78px; }
.name { font-size: 16pt; font-weight: 800; }
.meta { display: grid; grid-template-columns: 82px 1fr; gap: 5px; font-size: 10pt; }
.label { color: #64748b; font-weight: 700; }
table { width: 100%; border-collapse: collapse; margin-top: 22px; }
th { text-align: left; border-bottom: 3px solid #111827; padding: 7px; font-size: 10pt; letter-spacing: .08em; }
td { border-bottom: 1px solid #dbe3ea; padding: 7px; font-size: 10.5pt; }
.right { text-align: right; font-variant-numeric: tabular-nums; }
.total { border-top: 3px solid #111827; font-weight: 800; font-size: 12pt; }
.credits { margin-top: 14px; border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 10px; color: #166534; }
.sig { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 26px; font-weight: 800; font-size: 10pt; }
.line { border-top: 1px solid #111827; margin-top: 38px; padding-top: 6px; text-align: center; }
.foot { margin-top: 18px; text-align: center; font-size: 8pt; color: #64748b; }
</style></head><body><div class="page">
<div class="hdr">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
<div class="sub">CUSTOMER STATEMENT OF ACCOUNT</div>
<div class="grid">
  <div class="box">
    <div class="name">${escapeHtml(data.customer.name)}</div>
    <div>${escapeHtml(data.customer.address || "No address on file.")}</div>
    <div>${escapeHtml(data.customer.phone || "")}</div>
  </div>
  <div class="box meta">
    <div class="label">SOA #</div><div>${escapeHtml(data.soaNumber || "Preview")}</div>
    <div class="label">Period</div><div>${formatDate(data.from)} - ${formatDate(data.to)}</div>
    <div class="label">Invoices</div><div>${charges.length}</div>
    <div class="label">Terms</div><div>${data.customer.paymentTermsDays === 0 ? "COD" : `Net ${data.customer.paymentTermsDays}`}</div>
  </div>
</div>
<table><thead><tr><th>Date</th><th>Invoice / Reference</th><th class="right">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td class="total" colspan="2">TOTAL PAYABLE</td><td class="right total">${formatPeso(chargeTotal - creditTotal)}</td></tr></tfoot></table>
${creditRows}
<div class="sig"><div class="line">Prepared By</div><div class="line">Approved By</div><div class="line">Received By</div></div>
<div class="foot">Concise customer SOA. Match printed copies to the generated SOA record before collection.</div>
</div></body></html>`;
}

function buildCustomerCreditMemoHtml(data: {
  customerName: string;
  number: string | null;
  amount: number;
  date: string | null;
  status: string | null;
  notes?: string | null;
}) {
  const esc = (value: string | null | undefined) =>
    (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Credit Memo - ${esc(data.customerName)}</title>
<style>@page{size:letter portrait;margin:18mm}body{font-family:Arial,sans-serif;color:#111827}.hdr{text-align:center;font-family:Georgia,serif;font-weight:900;font-size:18pt;letter-spacing:.08em}.sub{text-align:center;font-weight:800;font-size:13pt;margin:4px 0 24px}.box{border:1px solid #cbd5e1;border-radius:10px;padding:16px}.grid{display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:12pt}.label{font-weight:800;color:#475569}.amount{font-size:20pt;font-weight:900;color:#047857}.note{margin-top:18px;border:1px solid #dbe3ea;border-radius:8px;padding:12px;min-height:80px}.sig{margin-top:70px;display:grid;grid-template-columns:1fr 1fr;gap:36px;font-weight:800}.line{border-top:1px solid #111827;padding-top:8px;text-align:center}</style></head>
<body><div class="hdr">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div><div class="sub">CUSTOMER CREDIT MEMO</div>
<div class="box"><div class="grid"><div class="label">Customer</div><div>${esc(data.customerName)}</div><div class="label">Credit Memo #</div><div>${esc(data.number || "N/A")}</div><div class="label">Date</div><div>${data.date ? formatDate(data.date) : "N/A"}</div><div class="label">Status</div><div>${esc(data.status || "Record")}</div><div class="label">Amount</div><div class="amount">${formatPeso(data.amount)}</div></div></div>
<div class="note"><b>Notes / proof</b><br>${esc(data.notes || "No notes recorded.")}</div>
<div class="sig"><div class="line">Prepared By</div><div class="line">Approved By</div></div></body></html>`;
}

function buildCustomerCollectionNotesHtml(customerName: string, notes: CustomerCollectionNote[]) {
  const esc = (value: string | null | undefined) =>
    (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const open = notes.filter((note) => !note.resolvedAt);
  const resolved = notes.filter((note) => note.resolvedAt);
  const rows = notes.map((note) => `
    <tr>
      <td>${note.createdAt ? formatDate(note.createdAt) : ""}</td>
      <td>${esc(note.noteType)}</td>
      <td>${esc(note.note)}</td>
      <td>${note.promiseToPayDate ? formatDate(note.promiseToPayDate) : ""}</td>
      <td>${note.followUpAt ? formatDate(note.followUpAt) : ""}</td>
      <td>${note.resolvedAt ? "Resolved" : "Open"}</td>
    </tr>
  `).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Collection Summary - ${esc(customerName)}</title>
<style>@page{size:letter portrait;margin:14mm}body{font-family:Arial,sans-serif;color:#111827;font-size:10pt}.hdr{text-align:center;font-family:Georgia,serif;font-weight:900;font-size:17pt;letter-spacing:.08em}.sub{text-align:center;font-weight:800;font-size:13pt;margin:4px 0 14px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.card{border:1px solid #cbd5e1;border-radius:8px;padding:10px}.label{font-size:8pt;font-weight:800;color:#64748b;text-transform:uppercase}.value{font-size:14pt;font-weight:900}table{width:100%;border-collapse:collapse}th{border-bottom:2px solid #111827;text-align:left;padding:6px;font-size:8pt;text-transform:uppercase}td{border-bottom:1px solid #dbe3ea;padding:6px;vertical-align:top}</style></head>
<body><div class="hdr">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div><div class="sub">CUSTOMER COLLECTION SUMMARY</div>
<h2>${esc(customerName)}</h2><div class="cards"><div class="card"><div class="label">Open notes</div><div class="value">${open.length}</div></div><div class="card"><div class="label">Resolved</div><div class="value">${resolved.length}</div></div><div class="card"><div class="label">Generated</div><div class="value">${formatDate(new Date().toISOString())}</div></div></div>
<table><thead><tr><th>Date</th><th>Type</th><th>Note</th><th>Promise</th><th>Follow-up</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="6">No collection notes recorded.</td></tr>`}</tbody></table></body></html>`;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>() ?? { id: "" };
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const { token, locationId, user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  // Edit customer
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", address: "", tin: "", creditLimit: "", paymentTermsDays: "30", customerType: "INDIVIDUAL", contactPerson: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  /* ── Data ── */
  const customerQuery = useCustomer(token, locationId, id);
  const customer = customerQuery.data?.customer;
  const recentTransactions = customerQuery.data?.recentTransactions;

  /* ── Tabs ── */
  const [activeTab, setActiveTab] = useState<CustomerTabKey>(() => normalizeCustomerTab(searchParams.get("tab")) ?? "transactions");

  const requestedTab = searchParams.get("tab");
  useEffect(() => {
    const nextTab = normalizeCustomerTab(requestedTab);
    if (nextTab && nextTab !== activeTab) setActiveTab(nextTab);
  }, [activeTab, requestedTab]);

  const selectCustomerTab = useCallback((tab: CustomerTabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "transactions") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(`/customers/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [id, router, searchParams]);

  /* ── Transaction filters ── */
  const [txTypeFilter, setTxTypeFilter] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState("");
  const [salesStatusFilter, setSalesStatusFilter] = useState("");
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txCursor, setTxCursor] = useState<string | undefined>();

  // Transaction action modals
  const [actionTx, setActionTx] = useState<any>(null); // the txn being acted on
  const [actionMenu, setActionMenu] = useState<string | null>(null); // txn id for open menu
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showEditAmountModal, setShowEditAmountModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRepairInfoModal, setShowRepairInfoModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showCreditControlModal, setShowCreditControlModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");
  const [reassignTarget, setReassignTarget] = useState<{ id: string; name: string } | null>(null);
  const [reassignReason, setReassignReason] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string } | null>(null);
  const [mergeReason, setMergeReason] = useState("");
  const [mergePreview, setMergePreview] = useState<CustomerMergePreview | null>(null);
  const [editNewAmount, setEditNewAmount] = useState("");
  const [editReason, setEditReason] = useState("");
  const [repairReference, setRepairReference] = useState("");
  const [repairDueDate, setRepairDueDate] = useState("");
  const [repairNotes, setRepairNotes] = useState("");
  const [repairReason, setRepairReason] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeAmount, setDisputeAmount] = useState("");
  const [disputeNotes, setDisputeNotes] = useState("");
  const [creditHoldType, setCreditHoldType] = useState<"NONE" | "WATCHLIST" | "BLOCK_BILLING">("NONE");
  const [creditHoldReason, setCreditHoldReason] = useState("");
  const [creditHoldNote, setCreditHoldNote] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [mergeSearchResults, setMergeSearchResults] = useState<any[]>([]);

  // Search customers for reassign
  useEffect(() => {
    if (!showReassignModal || reassignSearch.length < 2 || !token || !locationId) { setCustomerSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const res = await apiFetch<{ data: any[] }>(`/customers?search=${encodeURIComponent(reassignSearch)}&limit=10`, { token, locationId });
        setCustomerSearchResults((res.data || []).filter((c: any) => c.id !== id));
      } catch { setCustomerSearchResults([]); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [reassignSearch, showReassignModal, token, locationId, id]);

  useEffect(() => {
    if (!showMergeModal || mergeSearch.length < 2 || !token || !locationId) { setMergeSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const res = await apiFetch<{ data: any[] }>(`/customers?search=${encodeURIComponent(mergeSearch)}&limit=10`, { token, locationId });
        setMergeSearchResults((res.data || []).filter((c: any) => c.id !== id));
      } catch { setMergeSearchResults([]); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [mergeSearch, showMergeModal, token, locationId, id]);

  // Close action menu on outside click
  useEffect(() => {
    if (!actionMenu) return;
    const handler = () => setActionMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [actionMenu]);

  const handleReassign = async () => {
    if (!actionTx || !reassignTarget || !reassignReason.trim()) return;
    setActionLoading(true); setActionError("");
    try {
      await apiFetch(`/customers/${id}/transactions/${actionTx.id}/reassign`, {
        method: "PATCH", token, locationId,
        body: JSON.stringify({ newCustomerId: reassignTarget.id, reason: reassignReason.trim() }),
      });
      setShowReassignModal(false); setActionTx(null);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
    } catch (err: any) { setActionError(err.message || "Failed to reassign"); }
    finally { setActionLoading(false); }
  };

  const handleEditAmount = async () => {
    if (!actionTx || !editNewAmount || !editReason.trim()) return;
    setActionLoading(true); setActionError("");
    try {
      await apiFetch(`/customers/${id}/transactions/${actionTx.id}`, {
        method: "PATCH", token, locationId,
        body: JSON.stringify({ amount: parseFloat(editNewAmount), reason: editReason.trim() }),
      });
      setShowEditAmountModal(false); setActionTx(null);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
    } catch (err: any) { setActionError(err.message || "Failed to edit"); }
    finally { setActionLoading(false); }
  };

  const openRepairInfoModal = (tx: CustomerTransaction) => {
    setActionTx(tx);
    setRepairReference(tx.referenceNumber || "");
    setRepairDueDate(tx.dueDate ? String(tx.dueDate).slice(0, 10) : "");
    setRepairNotes(tx.notes || "");
    setRepairReason("");
    setActionError("");
    setShowRepairInfoModal(true);
  };

  const handleRepairInfo = async () => {
    if (!actionTx || !repairReason.trim()) return;
    setActionLoading(true); setActionError("");
    try {
      await apiFetch(`/customers/${id}/transactions/${actionTx.id}/repair-info`, {
        method: "PATCH", token, locationId,
        body: JSON.stringify({
          referenceNumber: repairReference.trim() || null,
          dueDate: repairDueDate || null,
          notes: repairNotes,
          reviewed: true,
          reason: repairReason.trim(),
        }),
      });
      setShowRepairInfoModal(false); setActionTx(null);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "timeline"] });
    } catch (err: any) { setActionError(err.message || "Failed to repair invoice info"); }
    finally { setActionLoading(false); }
  };

  const openDisputeModal = (tx: CustomerTransaction) => {
    setActionTx(tx);
    setDisputeReason("");
    setDisputeAmount(String(Math.abs(moneyValue(tx.amount)) || ""));
    setDisputeNotes("");
    setActionError("");
    setShowDisputeModal(true);
  };

  const handleCreateDispute = async () => {
    if (!actionTx || !disputeReason.trim()) return;
    setActionLoading(true); setActionError("");
    try {
      await apiFetch(`/customers/${id}/disputes`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          transactionId: actionTx.id,
          reason: disputeReason.trim(),
          disputedAmount: disputeAmount ? Number(disputeAmount) : null,
          notes: disputeNotes.trim() || null,
        }),
      });
      setShowDisputeModal(false);
      setActionTx(null);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "disputes"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
    } catch (err: any) { setActionError(err.message || "Failed to mark dispute"); }
    finally { setActionLoading(false); }
  };

  const openCreditControlModal = () => {
    const summary = customer?.creditControl;
    setCreditHoldType((summary?.holdType as "NONE" | "WATCHLIST" | "BLOCK_BILLING" | undefined) ?? "NONE");
    setCreditHoldReason(summary?.reason ?? "");
    setCreditHoldNote(summary?.note ?? "");
    setActionError("");
    setShowCreditControlModal(true);
  };

  const handleCreditControlSave = async () => {
    setActionLoading(true); setActionError("");
    try {
      await apiFetch(`/customers/${id}/credit-control`, {
        method: "PATCH",
        token,
        locationId,
        body: JSON.stringify({
          holdType: creditHoldType,
          status: creditHoldType === "NONE" ? "OK" : creditHoldType,
          reason: creditHoldReason.trim() || null,
          note: creditHoldNote.trim() || null,
        }),
      });
      setShowCreditControlModal(false);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "timeline"] });
    } catch (err: any) { setActionError(err.message || "Failed to update credit control"); }
    finally { setActionLoading(false); }
  };

  const openMergeModal = () => {
    setMergeSearch("");
    setMergeTarget(null);
    setMergeReason("");
    setMergePreview(null);
    setActionError("");
    setShowMergeModal(true);
  };

  const handleMergePreview = async () => {
    if (!mergeTarget) return;
    setActionLoading(true); setActionError("");
    try {
      const preview = await apiFetch<CustomerMergePreview>(`/customers/${id}/merge/preview`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({ duplicateCustomerId: mergeTarget.id }),
      });
      setMergePreview(preview);
    } catch (err: any) { setActionError(err.message || "Failed to preview customer merge"); }
    finally { setActionLoading(false); }
  };

  const handleMergeApply = async () => {
    if (!mergeTarget || !mergeReason.trim()) return;
    setActionLoading(true); setActionError("");
    try {
      await apiFetch<CustomerMergePreview>(`/customers/${id}/merge/apply`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({ duplicateCustomerId: mergeTarget.id, reason: mergeReason.trim() }),
      });
      setShowMergeModal(false);
      setMergeTarget(null);
      setMergePreview(null);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
    } catch (err: any) { setActionError(err.message || "Failed to merge customer"); }
    finally { setActionLoading(false); }
  };

  const handleMarkInvoiceReviewed = async (tx: CustomerTransaction) => {
    setActionError("");
    try {
      await apiFetch(`/customers/${id}/transactions/${tx.id}/repair-info`, {
        method: "PATCH", token, locationId,
        body: JSON.stringify({
          referenceNumber: tx.referenceNumber || null,
          dueDate: tx.dueDate || null,
          notes: tx.notes || "",
          reviewed: true,
          reason: "Reviewed invoice warning",
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "timeline"] });
    } catch (err: any) {
      setActionError(err.message || "Failed to mark invoice reviewed");
    }
  };

  const handleDeleteTx = async () => {
    if (!actionTx) return;
    setActionLoading(true); setActionError("");
    try {
      await apiFetch(`/customers/${id}/transactions/${actionTx.id}`, {
        method: "DELETE", token, locationId,
        body: JSON.stringify({ reason: deleteReason.trim() || "Deleted by admin" }),
      });
      setShowDeleteConfirm(false); setActionTx(null);
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
    } catch (err: any) { setActionError(err.message || "Failed to delete"); }
    finally { setActionLoading(false); }
  };

  const transactionsQuery = useCustomerTransactions(token, locationId, id, {
    type: txTypeFilter || undefined,
    from: txFrom || undefined,
    to: txTo || undefined,
    cursor: txCursor,
    limit: 30,
  });
  const salesQuery = useCustomerTransactions(token, locationId, id, {
    type: "CHARGE",
    limit: 100,
  });
  const disputesQuery = useCustomerDisputes(token, locationId, id);

  /* ── SOA state ── */
  const soaQuery = useSOA(token, locationId, id, "2025-01-01", todayISO());
  const [soaFrom, setSoaFrom] = useState("2025-01-01");
  const [soaTo, setSoaTo] = useState(todayISO());
  const [soaConfirm, setSoaConfirm] = useState<{ mode: "bill" | "unbilled"; selectedIds: string[]; unbilledCount: number; billedCount: number; totalCharges: number; totalCredits: number } | null>(null);
  const [soaProcessing, setSoaProcessing] = useState(false);
  const [selectedSoaTxns, setSelectedSoaTxns] = useState<Set<string>>(new Set());
  const [soaInlineError, setSoaInlineError] = useState("");

  /* ── SOA confirmation modal ── */

  /* ── Payment modal (multi-step, split payment) ── */
  type PayStep = "form" | "confirm" | "success" | "error";
  interface PayLine { id: string; method: string; amount: string; reference: string; bank: string; checkNumber: string; checkDate: string; cardType: string; batchNo: string; traceNo: string; }
  const newPayLine = (): PayLine => ({ id: Math.random().toString(36).slice(2), method: "CASH", amount: "", reference: "", bank: "", checkNumber: "", checkDate: "", cardType: "", batchNo: "", traceNo: "" });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeForm, setChargeForm] = useState({ referenceNumber: "", description: "", amount: "", chargeDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [chargeSaving, setChargeSaving] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [payStep, setPayStep] = useState<PayStep>("form");
  const [payLines, setPayLines] = useState<PayLine[]>([]);
  const [payNotes, setPayNotes] = useState("");
  const [payError, setPayError] = useState("");
  // EWT
  const [ewtEnabled, setEwtEnabled] = useState(false);
  const [ewtMode, setEwtMode] = useState<"difference" | "rate">("difference");
  const [ewtRate, setEwtRate] = useState("1");
  const [ewtAmount, setEwtAmount] = useState("");
  const [ewtBir, setEwtBir] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [paySoaList, setPaySoaList] = useState<any[]>([]);
  const [paySelectedSoas, setPaySelectedSoas] = useState<Set<string>>(new Set());
  // Mirror of paySelectedSoas readable from inside async closures (e.g. an SOA's
  // invoice-fetch resolve callback) without capturing a stale Set value. Without
  // this, a rapid check→uncheck→check sequence races: the in-flight fetch resolves
  // and writes the unchecked SOA's invoices into invoiceAllocs because the closure
  // sees the old, still-checked Set.
  const paySelectedSoasRef = useRef<Set<string>>(new Set());
  useEffect(() => { paySelectedSoasRef.current = paySelectedSoas; }, [paySelectedSoas]);
  // Invoice-level allocation within SOAs
  const [soaInvoices, setSoaInvoices] = useState<Record<string, any[]>>({}); // soaId → invoice[]
  const [invoiceAllocs, setInvoiceAllocs] = useState<Record<string, string>>({}); // txnId → allocated amount string
  const [payNoSoa, setPayNoSoa] = useState(false);
  const [payNewBalance, setPayNewBalance] = useState(0);
  const [payReceiptData, setPayReceiptData] = useState<PaymentReceiptData | null>(null);

  const METHOD_LABELS: Record<string, string> = { CASH: "Cash", CHECK: "Check", BANK_TRANSFER: "Bank Tx", CREDIT_CARD: "Card", GCASH: "GCash", MAYA: "Maya", QRPH: "QRPH", OTHER: "Other", EWT: "EWT", SPLIT: "Split" };

  const payLinesTotal = payLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const payEwtAmt = ewtEnabled ? (parseFloat(ewtAmount) || 0) : 0;
  const payTotal = payLinesTotal + payEwtAmt;
  const payOutstanding = parseFloat(customer?.currentBalance ?? "0");
  // SOA total for EWT "by difference" mode
  const paySoaTotal = paySoaList.filter((s) => paySelectedSoas.has(s.id)).reduce((sum: number, s: any) => sum + Math.max(0, (s.totalPayable || 0) - (s.paidAmount || 0)), 0);
  // Invoice-level selection total (charges positive, CMs negative — net total)
  const payInvoiceTotal = Object.keys(invoiceAllocs).length > 0
    ? Object.values(invoiceAllocs).reduce((s, amt) => s + (parseFloat(amt) || 0), 0)
    : 0;
  // Use invoice total if any invoices checked, else SOA total, else outstanding
  const paySelectedTotal = Object.keys(invoiceAllocs).length > 0 ? payInvoiceTotal : paySelectedSoas.size > 0 ? paySoaTotal : payOutstanding;
  const ewtEffectiveRate = paySelectedTotal > 0 && payEwtAmt > 0 ? ((payEwtAmt / paySelectedTotal) * 100) : 0;
  // Remaining: based on selected total
  const payTarget = paySelectedTotal;
  const payRemaining = payTarget - payTotal;

  const updatePayLine = (lineId: string, field: keyof PayLine, value: string) => {
    setPayLines((prev) => prev.map((l) => l.id === lineId ? { ...l, [field]: value } : l));
  };

  const openPaymentModal = async () => {
    const initLine = newPayLine();
    initLine.amount = customer ? customer.currentBalance : "0";
    setPayLines([initLine]);
    setPayNotes(""); setPayError(""); setPayStep("form"); setPaySelectedSoas(new Set()); setPayNoSoa(false); setSoaInvoices({}); setInvoiceAllocs({});
    setEwtEnabled(false); setEwtMode("difference"); setEwtRate("1"); setEwtAmount(""); setEwtBir("");
    setShowPaymentModal(true);
    try {
      const res = await apiFetch<{ data: any[] }>(`/customers/${id}/soa/history`, { token, locationId });
      setPaySoaList((res.data || []).filter((s: any) => s.status !== "VOID"));
    } catch { setPaySoaList([]); }
  };

  // Auto-highlight transaction from ?highlight=Q3173
  const highlightRef = searchParams.get("highlight");
  const [highlightHandled, setHighlightHandled] = useState(false);
  useEffect(() => {
    if (highlightRef && !highlightHandled && customer) {
      setHighlightHandled(true);
      setActiveTab("transactions");
      // After data loads, scroll to and highlight the matching row
      setTimeout(() => {
        const el = document.querySelector(`[data-ref="${highlightRef}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-primary/50", "bg-primary/5");
          setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "bg-primary/5"), 3000);
        }
      }, 500);
    }
  }, [highlightRef, highlightHandled, customer, transactionsQuery.data]);

  // Auto-open payment modal from ?pay=SOA-XXXX query param
  const payParam = searchParams.get("pay");
  const [payParamHandled, setPayParamHandled] = useState(false);
  useEffect(() => {
    if (payParam && customer && token && locationId && !payParamHandled && !showPaymentModal) {
      setPayParamHandled(true);
      // Open the payment modal, then pre-select the SOA after list loads
      (async () => {
        const initLine = newPayLine();
        setPayLines([initLine]);
        setPayNotes(""); setPayError(""); setPayStep("form"); setPaySelectedSoas(new Set()); setPayNoSoa(false); setSoaInvoices({}); setInvoiceAllocs({});
        setEwtEnabled(false); setEwtMode("difference"); setEwtRate("1"); setEwtAmount(""); setEwtBir("");
        setShowPaymentModal(true);
        try {
          const res = await apiFetch<{ data: any[] }>(`/customers/${id}/soa/history`, { token, locationId });
          const soaList = (res.data || []).filter((s: any) => s.status !== "VOID");
          setPaySoaList(soaList);
          // Find and pre-select the SOA from query param
          const targetSoa = soaList.find((s: any) => s.soaNumber === payParam);
          if (targetSoa) {
            setPaySelectedSoas(new Set([targetSoa.id]));
            const remaining = Math.max(0, (targetSoa.totalPayable || 0) - (targetSoa.paidAmount || 0));
            initLine.amount = remaining.toFixed(2);
            setPayLines([initLine]);
          }
        } catch { setPaySoaList([]); }
      })();
    }
  }, [payParam, customer, token, locationId, payParamHandled, showPaymentModal]);

  const handlePayReview = () => {
    if (payTotal <= 0) { setPayError("Total payment must be greater than 0"); return; }
    for (const l of payLines) {
      if (!l.method || (parseFloat(l.amount) || 0) <= 0) { setPayError("Each payment line needs a method and amount > 0"); return; }
    }
    if (payTotal > payOutstanding) { /* allow but warn */ }
    setPayError("");
    setPayNewBalance(payOutstanding - payTotal);
    setPayStep("confirm");
  };

  const handlePaySubmit = async () => {
    setPayLoading(true); setPayError("");
    try {
      // Fetch SOA invoices if not already loaded (for receipt invoice list)
      if (paySelectedSoas.size > 0) {
        for (const soaId of paySelectedSoas) {
          if (!soaInvoices[soaId]) {
            try {
              const res = await apiFetch<{ data: any[] }>(`/customers/${id}/soa/${soaId}/invoices`, { token, locationId });
              setSoaInvoices((prev) => ({ ...prev, [soaId]: res.data || [] }));
              // Also need to use it immediately since setState is async
              soaInvoices[soaId] = res.data || [];
            } catch {}
          }
        }
      }
      const primaryLine = payLines[0];
      const linesJson: any[] = payLines.map((l) => ({
        method: l.method, amount: parseFloat(l.amount) || 0,
        reference: l.reference || undefined, bank: l.bank || undefined,
        checkNumber: l.checkNumber || undefined, checkDate: l.checkDate || undefined,
        cardType: l.cardType || undefined, batchNumber: l.batchNo || undefined, traceNumber: l.traceNo || undefined,
      }));
      if (ewtEnabled && payEwtAmt > 0) {
        linesJson.push({ method: "EWT", amount: payEwtAmt, rate: parseFloat(ewtRate) || 0, bir2307: ewtBir || undefined, baseAmount: paySoaTotal || payOutstanding });
      }
      const txn = await apiFetch<any>(`/customers/${id}/payments`, {
        method: "POST", token, locationId,
        body: JSON.stringify({
          amount: payTotal.toFixed(2),
          paymentMethod: (payLines.length === 1 && !ewtEnabled) ? primaryLine.method : "SPLIT",
          referenceNumber: payLines.length === 1 ? (primaryLine.reference || undefined) : undefined,
          notes: (() => {
            const soaRefs = paySoaList.filter((s) => paySelectedSoas.has(s.id)).map((s) => s.soaNumber);
            const parts: string[] = [];
            if (payNotes.trim()) parts.push(payNotes.trim());
            if (soaRefs.length > 0) parts.push(`[SOA: ${soaRefs.join(", ")}]`);
            return parts.length > 0 ? parts.join(" ") : undefined;
          })(),
          batchNumber: primaryLine.method === "CREDIT_CARD" ? (primaryLine.batchNo || undefined) : undefined,
          traceNumber: primaryLine.method === "CREDIT_CARD" ? (primaryLine.traceNo || undefined) : undefined,
          cardType: primaryLine.method === "CREDIT_CARD" ? (primaryLine.cardType || undefined) : undefined,
          // Always send the structured lines — payment_lines JSON is the canonical
          // store for method-specific details (bank, check #, check date, card type,
          // batch, trace, reference). The previous gate skipped single-line non-EWT
          // payments, dropping check/card details on the floor; the reprint path
          // (customer transactions list) then had nothing to render and the receipt
          // came out missing Bank/CheckNo/CheckDate rows.
          paymentLines: linesJson,
          // Invoice-level allocations from the expanded SOA view
          allocations: Object.keys(invoiceAllocs).length > 0
            ? Object.entries(invoiceAllocs).filter(([, amt]) => parseFloat(amt) !== 0).map(([chargeTransactionId, amount]) => ({ chargeTransactionId, amount: Math.abs(parseFloat(amount)) }))
            : undefined,
          // Declare SOA scope so the server rejects allocations that point to
          // charges outside the selected SOAs (PAY-2026-0025 trap).
          soaIds: paySelectedSoas.size > 0 ? Array.from(paySelectedSoas) : undefined,
        }),
      });
      // SOA status is now recomputed server-side inside recordPayment — reading
      // real ar_payment_allocations instead of trusting client math. The old loop
      // here naively added the full payTotal to every selected SOA's paidAmount,
      // which caused SOA-0161 to be marked PAID even though ₱300 was unpaid.
      // DO NOT PATCH status from the client. If you need to force a state
      // transition (SENT / VOID only), use handleStatusChange.
      const selectedSoaDetails = paySoaList.filter((s) => paySelectedSoas.has(s.id)).map((s) => {
        const soaTotal = s.totalPayable;
        const prevPaid = s.paidAmount ?? 0;
        const thisPayment = s.totalPayable; // amount applied to this SOA
        const soaRemaining = Math.max(0, soaTotal - prevPaid - thisPayment);
        return {
          soaNumber: s.soaNumber,
          period: `${new Date(s.dateFrom).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} \u2013 ${new Date(s.dateTo).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`,
          amount: thisPayment,
          soaTotal,
          soaRemaining,
        };
      });
      // Build payment lines for receipt
      const receiptLines = payLines.map((l) => ({
        method: l.method, amount: parseFloat(l.amount) || 0,
        reference: l.reference || undefined, bank: l.bank || undefined,
        checkNumber: l.checkNumber || undefined, checkDate: l.checkDate || undefined,
        cardType: l.cardType || undefined, batchNumber: l.batchNo || undefined, traceNumber: l.traceNo || undefined,
      }));
      if (ewtEnabled && payEwtAmt > 0) {
        receiptLines.push({ method: "EWT", amount: payEwtAmt, reference: undefined, bank: undefined, checkNumber: undefined, checkDate: undefined, cardType: undefined, batchNumber: undefined, traceNumber: undefined });
      }
      // Build settled invoices list from checked allocations OR all SOA invoices
      // Include soaNumber per invoice for per-SOA grouping on the receipt
      const soaIdToNumber = new Map(paySoaList.map((s: any) => [s.id, s.soaNumber]));
      let settledInvoices: Array<{ referenceNumber: string; amount: number; soaNumber?: string }> = [];
      const checkedAllocs = Object.entries(invoiceAllocs).filter(([, amt]) => parseFloat(amt) !== 0);
      if (checkedAllocs.length > 0) {
        settledInvoices = checkedAllocs.map(([txnId, amt]) => {
          for (const [soaId, invList] of Object.entries(soaInvoices)) {
            const inv = (invList as any[]).find((i: any) => i.id === txnId);
            if (inv) return { referenceNumber: inv.referenceNumber || txnId.slice(0, 8), amount: parseFloat(amt), soaNumber: soaIdToNumber.get(soaId) };
          }
          return { referenceNumber: txnId.slice(0, 8), amount: parseFloat(amt) };
        });
      } else if (paySelectedSoas.size > 0) {
        for (const soaId of paySelectedSoas) {
          const invs = soaInvoices[soaId] || [];
          const soaNum = soaIdToNumber.get(soaId);
          for (const inv of invs) {
            if (inv.type === "CHARGE" && inv.paymentStatus !== "PAID" && inv.remainingAmount > 0) {
              settledInvoices.push({ referenceNumber: inv.referenceNumber || inv.id.slice(0, 8), amount: inv.remainingAmount, soaNumber: soaNum });
            }
          }
        }
      }

      setPayReceiptData({
        receiptNumber: txn.paymentNumber || "PAY-" + new Date().getFullYear(),
        date: new Date().toISOString(),
        customer: { name: customer!.name, code: customer!.phone },
        amount: payTotal,
        method: payLines.length === 1 ? primaryLine.method : "SPLIT",
        paymentLines: receiptLines,
        soaApplications: selectedSoaDetails,
        settledInvoices: settledInvoices.length > 0 ? settledInvoices : undefined,
        previousBalance: payOutstanding,
        newBalance: payOutstanding - payTotal,
      });
      setPayStep("success");
    } catch (err: any) {
      if (err?.body?.error === "ALLOCATION_SOA_MISMATCH") {
        const offenders = (err.body.details ?? []) as Array<{ chargeRef: string | null; billedSoaId: string | null }>;
        const refs = offenders.map((o) => o.chargeRef ?? "(unknown)").join(", ");
        setPayError(`Payment rejected: allocation references charge(s) outside the selected SOA(s) — ${refs}. Refresh and try again.`);
      } else {
        setPayError(err.message || "Failed to record payment");
      }
      setPayStep("error");
    } finally { setPayLoading(false); }
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    if (payStep === "success") {
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
      queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["customers", "soa", id] });
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

  const balance = moneyValue(customer!.currentBalance);
  const creditLimit = moneyValue(customer!.creditLimit);
  const unbilledCount = customer!.unbilledCount ?? 0;
  const profileMissingFields = missingCustomerProfileFields(customer!);
  const creditLimitMissing = balance > 0.01 && creditLimit <= 0.01;
  const overCreditLimit = creditLimit > 0.01 && balance > creditLimit + 0.01;
  const noRecentPayment = balance > 0.01 && !hasRecentCustomerPayment(customer!.lastPaymentDate);
  const agingBuckets = customer!.agingBuckets;
  const collectionSummary = customer!.collectionSummary;
  const invoiceWarnings = customer!.invoiceWarningCounts;
  const documentCounts = customer!.documentCounts;
  const creditControl = customer!.creditControl;
  const billingBlocked = Boolean(creditControl?.blocksBilling);
  const apiSafetyAlerts = customer!.safetySummary?.riskBadges ?? [];
  const safetyAlerts = [
    ...profileMissingFields.map((field) => `Missing ${field}`),
    ...(creditLimitMissing ? ["No credit limit while balance is open"] : []),
    ...(overCreditLimit ? ["Over credit limit"] : []),
    ...(billingBlocked ? [`Billing blocked${creditControl?.reason ? `: ${creditControl.reason}` : ""}`] : []),
    ...(creditControl?.holdType === "WATCHLIST" ? ["Credit watchlist"] : []),
    ...((customer!.disputeSummary?.openCount ?? 0) > 0 ? [`${customer!.disputeSummary?.openCount} open dispute${customer!.disputeSummary?.openCount === 1 ? "" : "s"}`] : []),
    ...((customer!.paymentRiskSummary?.openCount ?? 0) > 0 ? ["Open payment risk"] : []),
    ...(noRecentPayment ? ["No recent payment in 60 days"] : []),
    ...(collectionSummary?.dueFollowUpCount ? ["Collection follow-up due"] : []),
    ...(collectionSummary?.promiseToPayDate ? [`Promise to pay ${formatDate(collectionSummary.promiseToPayDate)}`] : []),
    ...apiSafetyAlerts.filter((alert) => !alert.startsWith("Missing ")),
  ];
  const statementTransactions = soaQuery.data?.transactions ?? [];
  const creditMemoCount = statementTransactions.filter((tx) => tx.type === "CREDIT_NOTE").length;
  const transactionRows = transactionsQuery.data?.data ?? [];
  const filteredTransactionRows = transactionRows.filter((tx) => transactionMatchesStatusFilter(tx, txStatusFilter));
  const salesRows = salesQuery.data?.data ?? [];
  const filteredSalesRows = salesRows.filter((tx) => transactionMatchesStatusFilter(tx, salesStatusFilter));
  const disputes = disputesQuery.data?.data ?? [];
  const openDisputes = disputes.filter((dispute) => !["RESOLVED", "CANCELLED"].includes(dispute.status));
  const disputeByTransactionId = new Map(
    openDisputes
      .filter((dispute) => dispute.transactionId)
      .map((dispute) => [dispute.transactionId as string, dispute]),
  );
  const salesCount = salesRows.length;
  const openEditCustomer = () => {
    if (!customer) return;
    setEditForm({
      name: customer.name || "", phone: customer.phone || "", email: customer.email || "",
      address: customer.address || "", tin: customer.tin || "",
      creditLimit: customer.creditLimit || "0", paymentTermsDays: String(customer.paymentTermsDays || 30),
      customerType: customer.customerType || "INDIVIDUAL", contactPerson: customer.contactPerson || "",
      notes: customer.notes || "",
    });
    setEditError("");
    setShowEditModal(true);
  };
  const tabs: Array<{ key: CustomerTabKey; label: string; badge?: string; badgeTone?: "default" | "warning" | "muted" | "success" }> = [
    { key: "transactions", label: "Transactions", badge: customer!.txnCount > 0 ? String(customer!.txnCount) : undefined, badgeTone: "muted" },
    { key: "sales", label: "Invoices / Charges", badge: salesCount > 0 ? String(salesCount) : undefined, badgeTone: "muted" },
    { key: "statement", label: "Statement of Account", badge: unbilledCount > 0 ? `${unbilledCount} unbilled` : undefined, badgeTone: "warning" },
    { key: "collections", label: "Collections", badge: collectionSummary?.openNoteCount ? String(collectionSummary.openNoteCount) : undefined, badgeTone: collectionSummary?.dueFollowUpCount ? "warning" : "muted" },
    { key: "documents", label: "Documents", badge: documentCounts ? String((documentCounts.soaRecords ?? 0) + (documentCounts.payments ?? 0) + (documentCounts.creditMemos ?? 0)) : undefined, badgeTone: "muted" },
    { key: "timeline", label: "Timeline" },
    { key: "soa-history", label: "SOA History" },
    { key: "payments", label: "Payment History", badge: customer!.lastPaymentDate ? "Recent" : undefined, badgeTone: "success" },
    { key: "credit-memos", label: "Credit Memos", badge: creditMemoCount > 0 ? String(creditMemoCount) : undefined, badgeTone: "success" },
  ];

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
          {/* Billing status from SOA data */}
          {soaQuery.data && (() => {
            const charges = soaQuery.data.transactions.filter((t) => t.type === "CHARGE");
            const unbilled = charges.filter((t) => !(t as any).billed);
            if (charges.length === 0) return null;
            return unbilled.length === 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{"\u2713"} FULLY BILLED</span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{"\u26A0"} {unbilled.length} UNBILLED</span>
            );
          })()}
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
      {safetyAlerts.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} />
              <span className="text-sm font-semibold">Customer safety checks</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={openEditCustomer}
                className="rounded-lg border border-amber-300 bg-background/80 px-3 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-background dark:border-amber-800 dark:text-amber-100"
              >
                Complete profile
              </button>
              <button
                type="button"
                onClick={() => router.push(`/customers/soa?customerId=${id}`)}
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
              >
                Open SOA Workspace
              </button>
              {isManager && balance > 0 && (
                <button
                  type="button"
                  onClick={openPaymentModal}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
                >
                  Record Payment
                </button>
              )}
              <button
                type="button"
                onClick={() => selectCustomerTab("credit-memos")}
                className="rounded-lg border border-slate-300 bg-background/80 px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-background dark:border-slate-700 dark:text-slate-100"
              >
                View Credit Memos
              </button>
              {isManager && (
                <button
                  type="button"
                  onClick={openCreditControlModal}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
                >
                  Credit Control
                </button>
              )}
              {isManager && (customer!.safetySummary?.duplicateWarnings?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={openMergeModal}
                  className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-[11px] font-semibold text-purple-800 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-100"
                >
                  Merge Duplicate
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {safetyAlerts.slice(0, 6).map((alert) => (
              <span key={alert} className="rounded-full border border-amber-300 bg-background/70 px-2 py-0.5 text-[11px] font-medium dark:border-amber-800">
                {alert}
              </span>
            ))}
            {safetyAlerts.length > 6 && (
              <span className="rounded-full border border-amber-300 bg-background/70 px-2 py-0.5 text-[11px] font-medium dark:border-amber-800">
                +{safetyAlerts.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

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
        <div className={cn(
          "rounded-xl border bg-background p-5 shadow-sm",
          billingBlocked ? "border-red-300 bg-red-50" : creditControl?.holdType === "WATCHLIST" ? "border-amber-300 bg-amber-50" : "border-border",
        )}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-medium text-muted-foreground">Credit Limit</div>
            {creditControl?.holdType && creditControl.holdType !== "NONE" && (
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                billingBlocked ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900",
              )}>
                {billingBlocked ? "Billing blocked" : "Watchlist"}
              </span>
            )}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {creditLimit === 0 ? "Unlimited" : formatPeso(customer!.creditLimit)}
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            Payment terms: {customer!.paymentTermsDays} days
          </div>
          {creditControl?.reason && (
            <div className="mt-2 text-[12px] font-semibold text-red-800">{creditControl.reason}</div>
          )}
          {isManager && (
            <button
              type="button"
              onClick={openCreditControlModal}
              className="mt-3 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
            >
              Edit credit control
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AccountMiniCard label="Current aging" value={formatPeso(agingBuckets?.current?.amount ?? 0)} sub={`${agingBuckets?.current?.count ?? 0} open`} />
        <AccountMiniCard label="1-30 days" value={formatPeso(agingBuckets?.days1to30?.amount ?? 0)} sub={`${agingBuckets?.days1to30?.count ?? 0} open`} tone={(agingBuckets?.days1to30?.amount ?? 0) > 0 ? "warning" : "neutral"} />
        <AccountMiniCard label="31-90 days" value={formatPeso((agingBuckets?.days31to60?.amount ?? 0) + (agingBuckets?.days61to90?.amount ?? 0))} sub={`${(agingBuckets?.days31to60?.count ?? 0) + (agingBuckets?.days61to90?.count ?? 0)} open`} tone={(agingBuckets?.days31to60?.amount ?? 0) + (agingBuckets?.days61to90?.amount ?? 0) > 0 ? "danger" : "neutral"} />
        <AccountMiniCard label="90+ days" value={formatPeso(agingBuckets?.days90plus?.amount ?? 0)} sub={`${agingBuckets?.days90plus?.count ?? 0} open`} tone={(agingBuckets?.days90plus?.amount ?? 0) > 0 ? "danger" : "neutral"} />
        <AccountMiniCard
          label="Collection next"
          value={collectionSummary?.nextFollowUpAt ? formatDate(collectionSummary.nextFollowUpAt) : collectionSummary?.promiseToPayDate ? formatDate(collectionSummary.promiseToPayDate) : "None"}
          sub={`${collectionSummary?.openNoteCount ?? 0} open notes`}
          tone={(collectionSummary?.dueFollowUpCount ?? 0) > 0 ? "danger" : "neutral"}
        />
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
        {isManager && (
          <button
            onClick={() => { setChargeForm({ referenceNumber: "", description: "", amount: "", chargeDate: new Date().toISOString().slice(0, 10), notes: "" }); setChargeError(""); setShowChargeModal(true); }}
            disabled={billingBlocked}
            title={billingBlocked ? "Customer account is on billing hold" : undefined}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} />
            Record Charge
          </button>
        )}
        {unbilledCount > 0 && (
          <button
            onClick={() => router.push(`/customers/soa?customerId=${id}`)}
            disabled={billingBlocked}
            title={billingBlocked ? "Customer account is on billing hold" : undefined}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText size={14} />
            Open SOA Workspace ({unbilledCount})
          </button>
        )}
        <button
          onClick={openEditCustomer}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Edit
        </button>
        <button
          onClick={async () => {
            if (!customer || !token || !locationId) return;
            try {
              // Reuse existing endpoints — no new API surface needed.
              //   /soa/history  → all SOAs (same as SOA History tab)
              //   /transactions → payments for the Payment History table
              const [soaRes, txnRes] = await Promise.all([
                apiFetch<{ data: any[] }>(
                  `/customers/${id}/soa/history`,
                  { token, locationId },
                ),
                apiFetch<{ data: any[] }>(
                  `/customers/${id}/transactions?type=PAYMENT&limit=200`,
                  { token, locationId },
                ),
              ]);
              const soas = soaRes.data || [];
              const payments = txnRes.data || [];
              const html = buildConsolidatedBillingHtml({
                customer: {
                  name: customer.name,
                  customerType: customer.customerType,
                  contactPerson: customer.contactPerson,
                  phone: customer.phone,
                  email: customer.email,
                  address: customer.address,
                  paymentTermsDays: customer.paymentTermsDays,
                  currentBalance: customer.currentBalance,
                },
                soas,
                payments,
                asOf: new Date(),
                filter: "all",
              });
              const w = window.open("", "_blank");
              if (w) {
                w.document.write(html);
                w.document.close();
                w.onload = () => w.print();
              }
            } catch {
              // fall through silently — matches the pattern used by handleReprint
            }
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Print Billing Summary
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => selectCustomerTab(tab.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tab.label}</span>
            {tab.badge && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none", tabBadgeClass(tab.badgeTone))}>
                {tab.badge}
              </span>
            )}
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
              <label className="text-[11px] font-medium text-muted-foreground">Status</label>
              <select
                value={txStatusFilter}
                onChange={(e) => setTxStatusFilter(e.target.value)}
                className="block w-44 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">All statuses</option>
                <option value="unbilled">Unbilled</option>
                <option value="billed">Billed</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="unpaid">Unpaid</option>
                <option value="credit_memo">Credit Memo</option>
                <option value="payment">Payment</option>
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
              <div className="w-8" />
            </div>

            {transactionsQuery.isLoading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : !transactionRows.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No transactions found.
              </div>
            ) : filteredTransactionRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No transactions match the selected filters.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredTransactionRows.map((tx) => (
                  <div key={tx.id} data-ref={tx.referenceNumber || tx.paymentNumber || undefined} className="flex items-center px-4 py-1.5 text-[13px] transition-all duration-500">
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
                    <div className="flex-1 truncate text-foreground flex items-center gap-1.5">
                      <span>
                        {tx.paymentMethod === "SPLIT" && tx.paymentLines
                          ? (tx.paymentLines as any[]).map((l: any) => `${METHOD_LABELS[l.method] ?? l.method} \u20B1${parseFloat(l.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`).join(" + ")
                          : tx.paymentMethod === "CREDIT_CARD"
                            ? `Credit Card${tx.cardType ? ` (${tx.cardType})` : ""}${tx.batchNumber ? ` Batch: ${tx.batchNumber}` : ""}${tx.traceNumber ? ` / Trace: ${tx.traceNumber}` : ""}`
                            : (tx.referenceNumber || tx.notes || "\u2014")}
                      </span>
                      {tx.type === "CHARGE" && tx.billed && (
                        <span className="inline-flex rounded px-1 py-px text-[8px] font-semibold bg-emerald-500/10 text-emerald-600">BILLED</span>
                      )}
                      {tx.type === "CHARGE" && tx.paymentStatus === "PAID" && (
                        <span className="inline-flex rounded px-1 py-px text-[8px] font-semibold bg-emerald-100 text-emerald-700">{"\u2713"} PAID</span>
                      )}
                      {tx.type === "CHARGE" && tx.paymentStatus === "PARTIAL" && (
                        <span className="inline-flex rounded px-1 py-px text-[8px] font-semibold bg-amber-100 text-amber-700">PARTIAL {formatPeso(tx.allocatedAmount || "0")}</span>
                      )}
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
                    <div className="w-8 text-right relative">
                      {tx.type === "CHARGE" && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); setActionMenu(actionMenu === tx.id ? null : tx.id); }}
                            className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                          </button>
                          {actionMenu === tx.id && (
                            <div className="absolute right-0 top-6 z-50 w-52 rounded-lg border border-border bg-background shadow-lg py-1" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => { setActionTx(tx); setEditNewAmount(Math.abs(parseFloat(tx.amount)).toString()); setEditReason(""); setActionError(""); setShowEditAmountModal(true); setActionMenu(null); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground hover:bg-accent">Edit Amount</button>
                              <button onClick={() => { setActionTx(tx); setReassignSearch(""); setReassignTarget(null); setReassignReason(""); setActionError(""); setShowReassignModal(true); setActionMenu(null); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground hover:bg-accent">Reassign to Another Customer</button>
                              <hr className="my-1 border-border" />
                              <button onClick={() => { setActionTx(tx); setDeleteReason(""); setActionError(""); setShowDeleteConfirm(true); setActionMenu(null); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-red-600 hover:bg-red-50">{tx.billed ? "Delete (must void SOA first)" : "Delete Transaction"}</button>
                            </div>
                          )}
                        </>
                      )}
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

          {/* ── Edit Amount Modal ── */}
          {showEditAmountModal && actionTx && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEditAmountModal(false)}>
              <div className="w-[420px] rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold">Edit Transaction Amount</h3>
                  <button onClick={() => setShowEditAmountModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="text-[12px] text-muted-foreground mb-4 space-y-1">
                  <div>Receipt: <b className="text-foreground">{actionTx.referenceNumber || "\u2014"}</b></div>
                  <div>Current Amount: <b className="text-foreground">{formatPeso(Math.abs(parseFloat(actionTx.amount)))}</b></div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">New Amount</label>
                    <input type="number" step="0.01" min="0" value={editNewAmount} onChange={(e) => setEditNewAmount(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Reason (required)</label>
                    <input type="text" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="e.g., Incorrect amount entered"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowEditAmountModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
                  <button onClick={handleEditAmount} disabled={actionLoading || !editNewAmount || !editReason.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {actionLoading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Reassign Modal ── */}
          {showReassignModal && actionTx && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowReassignModal(false)}>
              <div className="w-[480px] rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold">Reassign Transaction</h3>
                  <button onClick={() => setShowReassignModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="text-[12px] text-muted-foreground mb-4 space-y-1">
                  <div>Receipt: <b className="text-foreground">{actionTx.referenceNumber || "\u2014"}</b></div>
                  <div>Date: <b className="text-foreground">{formatDate(actionTx.recordedAt)}</b></div>
                  <div>Amount: <b className="text-foreground">{formatPeso(Math.abs(parseFloat(actionTx.amount)))}</b></div>
                  <div>Current Customer: <b className="text-foreground">{customer?.name}</b></div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Move to:</label>
                    <input type="text" value={reassignSearch} onChange={(e) => setReassignSearch(e.target.value)} placeholder="Search customer..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    {customerSearchResults.length > 0 && (
                      <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-border bg-background shadow-md">
                        {customerSearchResults.map((c: any) => (
                          <button key={c.id} onClick={() => { setReassignTarget({ id: c.id, name: c.name }); setReassignSearch(c.name); setCustomerSearchResults([]); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground hover:bg-accent text-left">
                            <span className="font-medium">{c.name}</span>
                            {c.customerType && <span className="text-[10px] text-muted-foreground">{c.customerType}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {reassignTarget && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600">
                        <span>Selected: <b>{reassignTarget.name}</b></span>
                        <button onClick={() => { setReassignTarget(null); setReassignSearch(""); }} className="text-red-500 hover:underline ml-1">clear</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Reason (required)</label>
                    <input type="text" value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder="e.g., Wrong customer charged"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800">
                  <b>This will:</b>
                  <ul className="list-disc ml-4 mt-1 space-y-0.5">
                    <li>Remove {formatPeso(Math.abs(parseFloat(actionTx.amount)))} from {customer?.name}&apos;s balance</li>
                    <li>Add {formatPeso(Math.abs(parseFloat(actionTx.amount)))} to {reassignTarget?.name || "selected customer"}&apos;s balance</li>
                    <li>Clear billing status if transaction was billed</li>
                  </ul>
                </div>
                {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowReassignModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
                  <button onClick={handleReassign} disabled={actionLoading || !reassignTarget || !reassignReason.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {actionLoading ? "Reassigning..." : "Reassign"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Delete Confirmation Modal ── */}
          {showDeleteConfirm && actionTx && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
              <div className="w-[420px] rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold text-red-600">Delete Transaction</h3>
                  <button onClick={() => setShowDeleteConfirm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="text-[12px] text-muted-foreground mb-3 space-y-1">
                  <div>Receipt: <b className="text-foreground">{actionTx.referenceNumber || "\u2014"}</b></div>
                  <div>Amount: <b className="text-foreground">{formatPeso(Math.abs(parseFloat(actionTx.amount)))}</b></div>
                </div>
                {actionTx.billed ? (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-700 mb-3">
                    This transaction is billed under an SOA. You must void the SOA first before deleting.
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-700 mb-3">
                      This action cannot be undone. The transaction will be permanently removed and the customer&apos;s balance will be recalculated.
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Reason (optional)</label>
                      <input type="text" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="e.g., Duplicate entry"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                  </>
                )}
                {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowDeleteConfirm(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
                  {!actionTx.billed && (
                    <button onClick={handleDeleteTx} disabled={actionLoading}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                      {actionLoading ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invoices / Charges tab */}
      {activeTab === "sales" && (() => {
        const totalSales = filteredSalesRows.reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0);
        const billedSales = filteredSalesRows.filter((tx) => tx.billed).length;
        const openSales = filteredSalesRows.filter((tx) => tx.paymentStatus !== "PAID").length;

        return (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sales loaded</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{filteredSalesRows.length}</div>
                <div className="text-[10px] text-muted-foreground">{salesStatusFilter ? "Filtered" : "All loaded charges"}</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Loaded amount</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatPeso(totalSales)}</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Needs attention</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-amber-700">{openSales}</div>
                <div className="text-[10px] text-muted-foreground">{billedSales} billed</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                <div>
                  <div className="text-[12px] font-semibold text-foreground">Invoices / Charges</div>
                  <div className="text-[11px] text-muted-foreground">Charge transactions, billing status, and payment state for this customer</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select
                    value={salesStatusFilter}
                    onChange={(e) => setSalesStatusFilter(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
                  >
                    <option value="">All statuses</option>
                    <option value="unbilled">Unbilled</option>
                    <option value="billed">Billed</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                  {unbilledCount > 0 && (
                    <button
                      onClick={() => router.push(`/customers/soa?customerId=${id}`)}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      Open SOA Workspace ({unbilledCount})
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <div className="w-28">Date</div>
                <div className="flex-1">Reference</div>
                <div className="w-28 text-right">Amount</div>
                <div className="w-24 text-center">Billing</div>
                <div className="w-24 text-center">Payment</div>
              </div>

              {salesQuery.isLoading ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}
                </div>
              ) : salesRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText size={22} className="text-muted-foreground/30" />
                  <p className="mt-2 text-sm font-medium text-foreground">No sales recorded yet</p>
                  <p className="text-[12px] text-muted-foreground">Charges created for this customer will appear here.</p>
                </div>
              ) : filteredSalesRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText size={22} className="text-muted-foreground/30" />
                  <p className="mt-2 text-sm font-medium text-foreground">No charges match this filter</p>
                  <p className="text-[12px] text-muted-foreground">Try another billing or payment status.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredSalesRows.map((tx) => {
                    const status = salesPaymentStatus(tx);
                    const warningBadges = invoiceWarningBadges(tx, salesRows);
                    const activeDispute = disputeByTransactionId.get(tx.id);
                    return (
                      <div key={tx.id} className="flex items-center px-4 py-2 text-[13px] hover:bg-accent/20">
                        <div className="w-28 text-muted-foreground">{formatDate(tx.recordedAt)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{tx.referenceNumber || tx.notes || "Charge"}</div>
                          {tx.notes && tx.referenceNumber && <div className="truncate text-[11px] text-muted-foreground">{tx.notes}</div>}
                          {activeDispute && (
                            <div className="mt-1 inline-flex rounded-md border border-red-300 bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-900">
                              Disputed: {activeDispute.reason}
                            </div>
                          )}
                          {warningBadges.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {warningBadges.slice(0, 3).map((warning) => (
                                <span key={warning.label} className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold", warning.className)}>
                                  {warning.label}
                                </span>
                              ))}
                              {warningBadges.length > 3 && (
                                <span className="rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">
                                  +{warningBadges.length - 3}
                                </span>
                              )}
                              <button type="button" onClick={() => openRepairInfoModal(tx)} className="rounded-md border border-border px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">
                                Edit invoice info
                              </button>
                              <button type="button" onClick={() => void handleMarkInvoiceReviewed(tx)} className="rounded-md border border-border px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">
                                Mark reviewed
                              </button>
                              {!activeDispute && (
                                <button type="button" onClick={() => openDisputeModal(tx)} className="rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-800 hover:bg-red-100">
                                  Mark disputed
                                </button>
                              )}
                            </div>
                          )}
                          {warningBadges.length === 0 && !activeDispute && (
                            <button type="button" onClick={() => openDisputeModal(tx)} className="mt-1 rounded-md border border-border px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">
                              Mark disputed
                            </button>
                          )}
                        </div>
                        <div className="w-28 text-right font-semibold tabular-nums text-foreground">{formatPeso(Math.abs(moneyValue(tx.amount)))}</div>
                        <div className="w-24 text-center">
                          <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", tx.billed ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")}>
                            {tx.billed ? "Billed" : "Unbilled"}
                          </span>
                        </div>
                        <div className="w-24 text-center">
                          <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", status.classes)}>
                            {status.label}
                          </span>
                          {status.label !== "Paid" && (
                            <button type="button" onClick={openPaymentModal} className="mt-1 block w-full text-[9px] font-bold text-emerald-700 hover:underline">
                              Record payment
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {showRepairInfoModal && actionTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowRepairInfoModal(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Edit invoice info</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">Repair reference, due date, or notes. Amount changes remain guarded by the separate amount-edit flow.</p>
              </div>
              <button type="button" onClick={() => setShowRepairInfoModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Reference number</label>
                <input value={repairReference} onChange={(event) => setRepairReference(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Due date</label>
                <input type="date" value={repairDueDate} onChange={(event) => setRepairDueDate(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Notes</label>
                <textarea value={repairNotes} onChange={(event) => setRepairNotes(event.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Reason required</label>
                <input value={repairReason} onChange={(event) => setRepairReason(event.target.value)} placeholder="e.g. corrected invoice reference" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              {actionError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{actionError}</div>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowRepairInfoModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => void handleRepairInfo()} disabled={actionLoading || !repairReason.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {actionLoading ? "Saving..." : "Save repair"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showDisputeModal && actionTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !actionLoading && setShowDisputeModal(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Mark invoice as disputed</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">This does not change the balance. It warns users before this charge is included in a new SOA.</p>
              </div>
              <button type="button" onClick={() => setShowDisputeModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
              <div className="font-semibold">{actionTx.referenceNumber || actionTx.notes || "Charge"}</div>
              <div className="mt-0.5">Amount: {formatPeso(Math.abs(moneyValue(actionTx.amount)))}</div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Dispute reason</label>
                <input value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} placeholder="e.g. wrong amount, waiting for proof, duplicate invoice" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Disputed amount</label>
                <input type="number" min="0" step="0.01" value={disputeAmount} onChange={(event) => setDisputeAmount(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Notes</label>
                <textarea value={disputeNotes} onChange={(event) => setDisputeNotes(event.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              {actionError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{actionError}</div>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowDisputeModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => void handleCreateDispute()} disabled={actionLoading || !disputeReason.trim()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
                {actionLoading ? "Saving..." : "Mark disputed"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCreditControlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !actionLoading && setShowCreditControlModal(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Credit control</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">Watchlist only warns. Block Billing stops manual charges and SOA generation unless changed by an admin.</p>
              </div>
              <button type="button" onClick={() => setShowCreditControlModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Hold level</label>
                <select value={creditHoldType} onChange={(event) => setCreditHoldType(event.target.value as "NONE" | "WATCHLIST" | "BLOCK_BILLING")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="NONE">None</option>
                  <option value="WATCHLIST">Watchlist</option>
                  <option value="BLOCK_BILLING">Block Billing</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Reason</label>
                <input value={creditHoldReason} onChange={(event) => setCreditHoldReason(event.target.value)} placeholder="e.g. over limit, bounced payment, manager review" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Override / approval note</label>
                <textarea value={creditHoldNote} onChange={(event) => setCreditHoldNote(event.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              {actionError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{actionError}</div>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreditControlModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => void handleCreditControlSave()} disabled={actionLoading || (creditHoldType !== "NONE" && !creditHoldReason.trim())} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {actionLoading ? "Saving..." : "Save credit control"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !actionLoading && setShowMergeModal(false)}>
          <div className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Merge duplicate customer</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">This keeps {customer!.name} as the survivor, reassigns records from the duplicate, and marks the duplicate inactive/merged.</p>
              </div>
              <button type="button" onClick={() => setShowMergeModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Find duplicate customer to merge into this account</label>
                  <input value={mergeSearch} onChange={(event) => { setMergeSearch(event.target.value); setMergeTarget(null); setMergePreview(null); }} placeholder="Search duplicate customer..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  {mergeSearchResults.length > 0 && !mergeTarget && (
                    <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-background">
                      {mergeSearchResults.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => { setMergeTarget({ id: candidate.id, name: candidate.name }); setMergeSearch(candidate.name); setMergeSearchResults([]); }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-muted"
                        >
                          <span className="font-semibold text-foreground">{candidate.name}</span>
                          <span className="text-muted-foreground">{candidate.phone || candidate.customerType}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={() => void handleMergePreview()} disabled={!mergeTarget || actionLoading} className="h-9 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
                    Preview
                  </button>
                </div>
              </div>

              {mergeTarget && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-[12px] text-purple-950">
                  Duplicate selected: <strong>{mergeTarget.name}</strong>. Survivor: <strong>{customer!.name}</strong>.
                </div>
              )}

              {mergePreview && (
                <div className="space-y-3">
                  {mergePreview.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950">
                      {mergePreview.warnings.map((warning) => <div key={warning}>{warning}</div>)}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-3">
                    {Object.entries(mergePreview.affectedCounts).map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label.replace(/([A-Z])/g, " $1")}</div>
                        <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{String(value)}</div>
                      </div>
                    ))}
                  </div>
                  {mergePreview.profileConflicts.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="grid grid-cols-3 bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        <div>Field</div>
                        <div>Survivor</div>
                        <div>Duplicate</div>
                      </div>
                      {mergePreview.profileConflicts.map((conflict) => (
                        <div key={conflict.field} className="grid grid-cols-3 border-t border-border px-3 py-2 text-[12px]">
                          <div className="font-semibold text-foreground">{conflict.field}</div>
                          <div className="text-muted-foreground">{String(conflict.survivorValue ?? "—")}</div>
                          <div className="text-muted-foreground">{String(conflict.duplicateValue ?? "—")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Reason required to apply merge</label>
                    <textarea value={mergeReason} onChange={(event) => setMergeReason(event.target.value)} rows={3} placeholder="Example: duplicate customer profile confirmed by phone/TIN" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {actionError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{actionError}</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
              <button type="button" onClick={() => setShowMergeModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => void handleMergeApply()} disabled={!mergePreview?.canApply || !mergeReason.trim() || actionLoading} className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white hover:bg-purple-800 disabled:opacity-50">
                {actionLoading ? "Merging..." : "Apply merge"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Statement of Account tab */}
      {activeTab === "statement" && (
        <SOAWorkspaceHandoffTab
          customer={customer!}
          customerId={id}
          token={token}
          locationId={locationId}
          currentBalance={balance}
          unbilledCount={unbilledCount}
          creditMemoCount={creditMemoCount}
          safetyAlerts={safetyAlerts}
          onOpenWorkspace={() => router.push(`/customers/soa?customerId=${id}`)}
          onCompleteProfile={openEditCustomer}
          onRecordPayment={openPaymentModal}
          onViewCreditMemos={() => selectCustomerTab("credit-memos")}
        />
      )}
      {false && (() => {
        const soaTxns = soaQuery.data?.transactions ?? [];
        // Billable = CHARGE + CREDIT_NOTE (not PAYMENT — payments are already applied)
        const soaBillable = soaTxns.filter((t) => t.type === "CHARGE" || t.type === "CREDIT_NOTE");
        const soaCharges = soaTxns.filter((t) => t.type === "CHARGE");
        const soaUnbilled = soaBillable.filter((t) => !t.billed);
        const selectedBillableIds = [...selectedSoaTxns].filter((sid) => soaBillable.some((c) => c.id === sid));
        const selectedDebits = soaTxns.filter((t) => t.type === "CHARGE" && selectedSoaTxns.has(t.id)).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
        const selectedCredits = soaTxns.filter((t) => t.type === "CREDIT_NOTE" && selectedSoaTxns.has(t.id)).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
        const selectedTotal = selectedDebits - selectedCredits;
        const selectAll = () => setSelectedSoaTxns(new Set(soaBillable.filter((t) => !t.billed).map((t) => t.id)));
        const deselectAll = () => setSelectedSoaTxns(new Set());
        const toggleTxn = (txId: string) => setSelectedSoaTxns((prev) => { const next = new Set(prev); if (next.has(txId)) next.delete(txId); else next.add(txId); return next; });

        return (
        <div>
          {soaInlineError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
              {soaInlineError}
            </div>
          )}
          {/* Controls: DateRangePicker + Action buttons */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <DateRangePicker startDate={soaFrom} endDate={soaTo} onChange={(s, e) => { setSoaFrom(s); setSoaTo(e); setSelectedSoaTxns(new Set()); }} />
            <button
              onClick={() => {
                if (!soaQuery.data) return;
                const html = buildSOAHtml({ customer: soaQuery.data.customer, transactions: soaQuery.data.transactions, openingBalance: soaQuery.data.openingBalance, closingBalance: soaQuery.data.closingBalance, from: soaFrom, to: soaTo });
                const w = window.open("", "_blank");
                if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
              }}
              disabled={!soaQuery.data}
              className="h-8 rounded-lg border border-border px-3 text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Print Statement
            </button>
            <button
              onClick={() => {
                setSoaInlineError("");
                if (!soaQuery.data || selectedBillableIds.length === 0) { setSoaInlineError("Select invoices to bill first."); return; }
                const selected = soaBillable.filter((c) => selectedSoaTxns.has(c.id));
                const unbilled = selected.filter((t) => !t.billed);
                const billed = selected.filter((t) => t.billed);
                if (unbilled.length === 0) { setSoaInlineError("All selected transactions are already billed."); return; }
                const totalC = selected.filter((t) => t.type === "CHARGE").reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
                const totalCr = selected.filter((t) => t.type === "CREDIT_NOTE").reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
                setSoaConfirm({ mode: "bill", selectedIds: selectedBillableIds, unbilledCount: unbilled.length, billedCount: billed.length, totalCharges: totalC, totalCredits: totalCr });
              }}
              disabled={!soaQuery.data || selectedBillableIds.length === 0}
              className="h-8 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Print &amp; Bill ({selectedBillableIds.length})
            </button>
            <button
              onClick={() => {
                setSoaInlineError("");
                if (!soaQuery.data) return;
                if (soaUnbilled.length === 0) { setSoaInlineError("No unbilled transactions found."); return; }
                // Auto-select all unbilled (charges + credit notes)
                const ids = soaUnbilled.map((t) => t.id);
                setSelectedSoaTxns(new Set(ids));
                const totalC = soaUnbilled.filter((t) => t.type === "CHARGE").reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
                const totalCr = soaUnbilled.filter((t) => t.type === "CREDIT_NOTE").reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
                setSoaConfirm({ mode: "unbilled", selectedIds: ids, unbilledCount: soaUnbilled.length, billedCount: 0, totalCharges: totalC, totalCredits: totalCr });
              }}
              disabled={!soaQuery.data || soaUnbilled.length === 0}
              className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[12px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              Print Unbilled ({soaUnbilled.length})
            </button>
          </div>

          {/* Inline SOA Preview */}
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            {/* Summary header */}
            {soaQuery.data && soaTxns.length > 0 && (
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                <span className="text-[11px] font-semibold text-foreground">
                  {customer!.name} &mdash; {soaFrom ? formatDate(soaFrom) : "All Time"} to {formatDate(soaTo)}
                </span>
                <span className="text-[11px] tabular-nums font-semibold text-foreground">
                  {soaTxns.length} transactions
                </span>
              </div>
            )}

            <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <div className="w-8" />
              <div className="w-28">Date</div>
              <div className="flex-1">Description</div>
              <div className="w-28 text-right">Debit</div>
              <div className="w-28 text-right">Credit</div>
              <div className="w-32 text-right">Balance</div>
            </div>

            {soaQuery.isLoading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}
              </div>
            ) : soaQuery.data ? (
              <div className="divide-y divide-border">
                {/* Opening Balance */}
                <div className="flex items-center px-4 py-2 text-[13px] bg-muted/20">
                  <div className="w-8" />
                  <div className="w-28 text-muted-foreground">{formatDate(soaFrom)}</div>
                  <div className="flex-1 font-medium text-foreground">Opening Balance</div>
                  <div className="w-28" />
                  <div className="w-28" />
                  <div className="w-32 text-right tabular-nums font-medium text-foreground">{formatPeso(soaQuery.data!.openingBalance)}</div>
                </div>

                {/* Transaction rows */}
                {soaTxns.map((tx) => {
                  const isBillable = tx.type === "CHARGE" || tx.type === "CREDIT_NOTE";
                  const isBilled = Boolean(isBillable && tx.billed);
                  const isChecked = selectedSoaTxns.has(tx.id);
                  return (
                    <div key={tx.id} className={cn("flex items-center px-4 py-2 text-[13px]", isChecked && "bg-primary/[0.03]", !isChecked && "hover:bg-accent/20")}>
                      <div className="w-8">
                        {isBillable && (
                          <input type="checkbox" checked={isChecked} disabled={isBilled}
                            onChange={() => toggleTxn(tx.id)}
                            className={cn("h-3.5 w-3.5 accent-primary rounded", isBilled && "opacity-40")} />
                        )}
                      </div>
                      <div className="w-28 text-muted-foreground">{formatDate(tx.recordedAt)}</div>
                      <div className="flex-1 truncate text-foreground flex items-center gap-1.5">
                        <span>{tx.referenceNumber || tx.notes || tx.type}</span>
                        {isBilled && <span className="inline-flex rounded px-1 py-px text-[8px] font-semibold bg-emerald-500/10 text-emerald-600">BILLED</span>}
                      </div>
                      <div className="w-28 text-right tabular-nums text-red-600">{isDebit(tx) ? formatPeso(Math.abs(parseFloat(tx.amount))) : ""}</div>
                      <div className="w-28 text-right tabular-nums text-emerald-600">{!isDebit(tx) ? formatPeso(Math.abs(parseFloat(tx.amount))) : ""}</div>
                      <div className="w-32 text-right tabular-nums font-medium text-foreground">{formatPeso(tx.balanceAfter)}</div>
                    </div>
                  );
                })}

                {/* Closing Balance */}
                <div className="flex items-center px-4 py-1.5 text-[13px] bg-muted/20">
                  <div className="w-8" />
                  <div className="w-28 text-muted-foreground">{formatDate(soaTo)}</div>
                  <div className="flex-1 font-bold text-foreground">Closing Balance</div>
                  <div className="w-28" />
                  <div className="w-28" />
                  <div className="w-32 text-right tabular-nums font-bold text-foreground">{formatPeso(soaQuery.data!.closingBalance)}</div>
                </div>

                {/* Totals + selection summary */}
                {(() => {
                  const debits = soaTxns.filter((t) => isDebit(t)).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
                  const credits = soaTxns.filter((t) => !isDebit(t)).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
                  return (
                    <div className="px-4 py-3 bg-muted/10 border-t border-border">
                      <div className="flex items-center text-[12px]">
                        <div className="w-8" />
                        <div className="w-28" />
                        <div className="flex-1 font-semibold text-muted-foreground">Totals</div>
                        <div className="w-28 text-right tabular-nums font-semibold text-red-600">{formatPeso(debits)}</div>
                        <div className="w-28 text-right tabular-nums font-semibold text-emerald-600">{credits > 0 ? formatPeso(credits) : ""}</div>
                        <div className="w-32" />
                      </div>
                      {/* Selection controls */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-3">
                          <button onClick={selectAll} className="text-[11px] font-medium text-primary hover:underline">Select Unbilled</button>
                          <button onClick={deselectAll} className="text-[11px] font-medium text-muted-foreground hover:underline">Deselect All</button>
                        </div>
                        {selectedBillableIds.length > 0 && (
                          <span className="text-[11px] tabular-nums text-foreground">
                            <strong>{selectedBillableIds.length}</strong> selected &middot; <strong>{formatPeso(selectedTotal)}</strong>{selectedCredits > 0 && <span className="text-muted-foreground"> (charges {formatPeso(selectedDebits)} - credits {formatPeso(selectedCredits)})</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No statement data available.</div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Payment History tab */}
      {activeTab === "payments" && <PaymentHistoryTab customerId={id} token={token} locationId={locationId} customerName={customer!.name} customerCode={customer!.phone} />}

      {/* Credit Memos tab */}
      {activeTab === "credit-memos" && <CreditMemosTab customerId={id} token={token} locationId={locationId} />}

      {/* SOA History tab */}
      {activeTab === "soa-history" && <SOAHistoryTab customerId={id} token={token} locationId={locationId} />}

      {/* Collections tab */}
      {activeTab === "collections" && (
        <CollectionsTab
          customerId={id}
          token={token}
          locationId={locationId}
          collectionSummary={collectionSummary}
        />
      )}

      {/* Documents tab */}
      {activeTab === "documents" && (
        <DocumentsTab
          customerId={id}
          token={token}
          locationId={locationId}
          customerName={customer!.name}
          customerCode={customer!.phone}
        />
      )}

      {/* Timeline tab */}
      {activeTab === "timeline" && <TimelineTab customerId={id} token={token} locationId={locationId} />}

      {/* ── SOA Confirmation Modal ── */}
      {soaConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">
              {soaConfirm.mode === "bill" ? `Generate SOA \u2014 ${soaFrom} to ${soaTo}` : "Generate SOA \u2014 Unbilled Transactions"}
            </h3>
            <div className="space-y-2 text-[13px] text-foreground mb-4">
              <p><strong>Customer:</strong> {customer!.name}</p>
              <p>Selected invoices: <strong>{soaConfirm.selectedIds.length}</strong></p>
              {soaConfirm.billedCount > 0 && <p className="text-[12px] text-muted-foreground">&bull; Already billed: {soaConfirm.billedCount} (will appear but won&apos;t be re-billed)</p>}
              <p>Total charges: <strong>{formatPeso(soaConfirm.totalCharges)}</strong></p>
              {soaConfirm.totalCredits > 0 && <p>Credit memos: <strong>{formatPeso(soaConfirm.totalCredits)}</strong></p>}
              <p>Net payable: <strong>{formatPeso(soaConfirm.totalCharges - soaConfirm.totalCredits)}</strong></p>
            </div>
            <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-[12px] text-muted-foreground mb-4">
              <p>This will:</p>
              <p>&bull; Generate SOA and assign SOA number</p>
              <p>&bull; Mark {soaConfirm.unbilledCount} transaction{soaConfirm.unbilledCount !== 1 ? "s" : ""} as BILLED</p>
              <p>&bull; Open print preview with selected invoices only</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSoaConfirm(null)} disabled={soaProcessing}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button
                onClick={async () => {
                  if (!soaQuery.data || !soaConfirm) return;
                  setSoaProcessing(true);
                  try {
                    const selectedIds = soaConfirm.selectedIds;
                    // Generate SOA with selected transaction IDs
                    const res = await apiFetch<{ soaNumber: string }>(`/customers/${id}/soa/generate`, {
                      method: "POST",
                      body: JSON.stringify({ from: soaFrom, to: soaTo, transactionIds: selectedIds, unbilledOnly: soaConfirm.mode === "unbilled" }),
                      token, locationId,
                    });
                    // Print only selected transactions
                    const selectedTxns = soaQuery.data.transactions.filter((t) => selectedIds.includes(t.id));
                    const selectedChargeTotal = selectedTxns.filter((t) => isDebit(t)).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
                    const html = buildSOAHtml({
                      customer: soaQuery.data.customer,
                      transactions: selectedTxns,
                      openingBalance: 0,
                      closingBalance: selectedChargeTotal,
                      from: soaFrom,
                      to: soaTo,
                      soaNumber: res.soaNumber,
                    });
                    const w = window.open("", "_blank");
                    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
                    setSelectedSoaTxns(new Set());
                    queryClient.invalidateQueries({ queryKey: ["customers", id] });
                    queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
                    queryClient.invalidateQueries({ queryKey: ["customers", "soa"] });
                  } catch {}
                  setSoaProcessing(false);
                  setSoaConfirm(null);
                }}
                disabled={soaProcessing}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {soaProcessing && <Loader2 size={14} className="animate-spin" />}
                Generate &amp; Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Customer Modal ── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEditModal(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold">Edit Customer</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground">{"\u2715"}</button>
            </div>
            {editError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
                {editError}
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Name *</label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Type</label>
                  <select value={editForm.customerType} onChange={(e) => setEditForm({ ...editForm, customerType: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="SHOP">Shop</option>
                    <option value="FLEET">Fleet</option>
                    <option value="WHOLESALE">Wholesale</option>
                    <option value="COMPANY">Company</option>
                    <option value="GOVERNMENT">Government</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Phone / AR Code</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Contact Person</label>
                  <input type="text" value={editForm.contactPerson} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Email</label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Address</label>
                <input type="text" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">TIN</label>
                  <input type="text" value={editForm.tin} onChange={(e) => setEditForm({ ...editForm, tin: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Credit Limit</label>
                  <input type="number" step="0.01" value={editForm.creditLimit} onChange={(e) => setEditForm({ ...editForm, creditLimit: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Terms (days)</label>
                  <input type="number" value={editForm.paymentTermsDays} onChange={(e) => setEditForm({ ...editForm, paymentTermsDays: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowEditModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={async () => {
                setEditSaving(true);
                setEditError("");
                try {
                  await apiFetch(`/customers/${id}`, {
                    method: "PATCH", token, locationId,
                    body: JSON.stringify({
                      name: editForm.name, phone: editForm.phone, email: editForm.email || undefined,
                      address: editForm.address || undefined, tin: editForm.tin || undefined,
                      creditLimit: editForm.creditLimit || "0", paymentTermsDays: parseInt(editForm.paymentTermsDays) || 30,
                      customerType: editForm.customerType, contactPerson: editForm.contactPerson || undefined,
                      notes: editForm.notes || undefined,
                    }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["customers", id] });
                  setShowEditModal(false);
                } catch (err: any) { setEditError(err.message || "Failed to save"); }
                finally { setEditSaving(false); }
              }} disabled={editSaving || !editForm.name.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal (Multi-Step) ── */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl max-h-[90vh] overflow-y-auto">

            {/* ── Step: Form (Split Payment) ── */}
            {payStep === "form" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold">Record Payment</h3>
                  <button onClick={closePaymentModal} className="rounded p-1 hover:bg-muted"><X size={16} /></button>
                </div>
                <p className="text-[13px] text-muted-foreground mb-4">{customer!.name} &mdash; Outstanding: <strong className="text-red-600">{formatPeso(customer!.currentBalance)}</strong></p>

                {payError && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">{payError}</div>}

                {/* SOA Selector */}
                {paySoaList.length > 0 && !payNoSoa && (
                  <div className="mb-4">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Apply To</label>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
                      {paySoaList.map((s: any) => {
                        const isPaid = s.status === "PAID";
                        const soaPaid = s.paidAmount || 0;
                        const soaRemaining = Math.max(0, (s.totalPayable || 0) - soaPaid);
                        const isSelected = paySelectedSoas.has(s.id);
                        const invoices = soaInvoices[s.id] || [];
                        return (
                          <div key={s.id}>
                            <label className={cn("flex items-center gap-2.5 px-3 py-2 text-[12px] cursor-pointer hover:bg-accent/30 transition-colors", isPaid && "opacity-40 cursor-not-allowed")}>
                              <input type="checkbox" disabled={isPaid} checked={isSelected}
                                onChange={async (e) => {
                                  const next = new Set(paySelectedSoas);
                                  if (e.target.checked) next.add(s.id);
                                  else next.delete(s.id);
                                  // Sync ref + state BEFORE the await so a concurrent fetch resolve
                                  // sees the user's current selection, not a stale snapshot. The
                                  // ref is the load-bearing one — closures read it; React state is
                                  // updated alongside for normal re-render flow.
                                  paySelectedSoasRef.current = next;
                                  setPaySelectedSoas(next);
                                  if (e.target.checked) {
                                    // Always fetch fresh invoices for this SOA (don't cache)
                                    try {
                                      const res = await apiFetch<{ data: any[] }>(`/customers/${id}/soa/${s.id}/invoices`, { token, locationId });
                                      // Race guard: discard stale data if the user unchecked or
                                      // swapped this SOA while the fetch was in flight. Otherwise
                                      // we'd merge invoices into invoiceAllocs for an SOA that's
                                      // no longer selected (PAY-2026-0025 leak vector).
                                      if (!paySelectedSoasRef.current.has(s.id)) return;
                                      setSoaInvoices((prev) => ({ ...prev, [s.id]: res.data || [] }));
                                      // Auto-FIFO allocate — use actual invoice remaining, not SOA-level total
                                      const newAllocs: Record<string, string> = {};
                                      const actualRemaining = (res.data || []).filter((inv: any) => inv.type === "CHARGE" && inv.remainingAmount > 0).reduce((s: number, inv: any) => s + inv.remainingAmount, 0);
                                      let rem = actualRemaining;
                                      for (const inv of (res.data || [])) {
                                        if (rem <= 0.005) break;
                                        if (inv.type !== "CHARGE" || inv.remainingAmount <= 0) continue;
                                        const a = Math.min(rem, inv.remainingAmount);
                                        newAllocs[inv.id] = a.toFixed(2);
                                        rem -= a;
                                      }
                                      // Also auto-tick all CMs on this SOA so the Selected Invoices total
                                      // matches the SOA payable header. Mirrors the Select-All button's
                                      // behavior (writes full inv.amount, ignoring any prior allocation
                                      // against the CM — same as Select-All today).
                                      for (const inv of (res.data || [])) {
                                        if (inv.type === "CREDIT_NOTE") {
                                          newAllocs[inv.id] = `-${inv.amount.toFixed(2)}`;
                                        }
                                      }
                                      setInvoiceAllocs((prev) => ({ ...prev, ...newAllocs }));
                                    } catch {}
                                  } else {
                                    // Clear allocations for this SOA's invoices (sync; no fetch)
                                    const invIds = new Set((soaInvoices[s.id] || []).map((i: any) => i.id));
                                    setInvoiceAllocs((prev) => { const n = { ...prev }; for (const k of Object.keys(n)) if (invIds.has(k)) delete n[k]; return n; });
                                  }
                                }} className="h-3.5 w-3.5 accent-primary rounded" />
                              <span className="font-mono text-[11px] font-semibold text-primary">{s.soaNumber}</span>
                              <span className="text-muted-foreground flex-1">
                                {formatPeso(s.totalPayable)}
                                {soaPaid > 0 && !isPaid && <span className="text-[10px] ml-1">({formatPeso(soaPaid)} paid, {formatPeso(soaRemaining)} left)</span>}
                              </span>
                              <span className={cn("rounded px-1.5 py-px text-[8px] font-semibold uppercase",
                                isPaid ? "bg-emerald-100 text-emerald-700" : s.status === "PARTIAL" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700")}>{s.status}</span>
                            </label>
                            {/* Expanded invoice list — checkbox selection */}
                            {isSelected && invoices.length > 0 && (() => {
                              const selectableInvs = invoices.filter((inv: any) => inv.type === "CHARGE" && inv.paymentStatus !== "PAID");
                              const selectableCms = invoices.filter((inv: any) => inv.type === "CREDIT_NOTE");
                              const selectedInvCount = [...selectableInvs, ...selectableCms].filter((inv: any) => invoiceAllocs[inv.id]).length;
                              const selectedChargeTotal = selectableInvs.reduce((s: number, inv: any) => s + (parseFloat(invoiceAllocs[inv.id] || "0") || 0), 0);
                              const selectedCmTotal = selectableCms.filter((inv: any) => invoiceAllocs[inv.id]).reduce((s: number, inv: any) => s + inv.amount, 0);
                              const selectedInvTotal = selectedChargeTotal - selectedCmTotal;
                              return (
                              <div className="bg-muted/20 border-t border-border/30">
                                {/* Table header */}
                                <div className="grid grid-cols-[28px_1fr_90px_90px_70px] gap-1 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/20">
                                  <span />
                                  <span>Invoice</span>
                                  <span className="text-right">Amount</span>
                                  <span className="text-right">Remaining</span>
                                  <span className="text-center">Status</span>
                                </div>
                                {/* Invoice rows */}
                                <div className="max-h-48 overflow-y-auto">
                                  {invoices.map((inv: any) => {
                                    const isPaidInv = inv.paymentStatus === "PAID";
                                    const isCredit = inv.type === "CREDIT_NOTE";
                                    const isSelectable = (inv.type === "CHARGE" && !isPaidInv) || isCredit;
                                    const isCheckedInv = !!invoiceAllocs[inv.id];
                                    return (
                                      <div key={inv.id} className={cn("grid grid-cols-[28px_1fr_90px_90px_70px] gap-1 px-3 py-1.5 text-[11px] border-b border-border/10",
                                        isCheckedInv && "bg-primary/[0.04]", isPaidInv && "opacity-40")}>
                                        <div>
                                          {isSelectable && (
                                            <input type="checkbox" checked={isCheckedInv}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  const val = isCredit ? `-${inv.amount.toFixed(2)}` : inv.remainingAmount.toFixed(2);
                                                  setInvoiceAllocs((prev) => ({ ...prev, [inv.id]: val }));
                                                } else {
                                                  setInvoiceAllocs((prev) => { const n = { ...prev }; delete n[inv.id]; return n; });
                                                }
                                              }}
                                              className="h-3.5 w-3.5 accent-primary rounded" />
                                          )}
                                        </div>
                                        <span className={cn("font-mono font-medium truncate", isCredit ? "text-emerald-600" : "text-foreground")}>{inv.referenceNumber || inv.type}</span>
                                        <span className={cn("text-right tabular-nums", isCredit ? "text-emerald-600" : "text-foreground")}>{isCredit ? `-${formatPeso(inv.amount)}` : formatPeso(inv.amount)}</span>
                                        <span className="text-right tabular-nums text-muted-foreground">{inv.type === "CHARGE" ? formatPeso(inv.remainingAmount) : "\u2014"}</span>
                                        <span className="text-center">
                                          {isPaidInv && <span className="text-[8px] font-semibold text-emerald-600">{"\u2713"} PAID</span>}
                                          {inv.paymentStatus === "PARTIAL" && <span className="text-[8px] font-semibold text-amber-600">PARTIAL</span>}
                                          {isCredit && <span className="text-[8px] font-semibold text-emerald-600">CREDIT</span>}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Selection summary + quick actions */}
                                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-t border-border/30">
                                  <div className="flex items-center gap-3">
                                    <button onClick={() => {
                                      const newAllocs: Record<string, string> = {};
                                      for (const inv of selectableInvs) newAllocs[inv.id] = inv.remainingAmount.toFixed(2);
                                      for (const inv of selectableCms) newAllocs[inv.id] = `-${inv.amount.toFixed(2)}`;
                                      setInvoiceAllocs((prev) => ({ ...prev, ...newAllocs }));
                                    }} className="text-[9px] font-medium text-primary hover:underline">Select All</button>
                                    <button onClick={() => {
                                      setInvoiceAllocs((prev) => {
                                        const n = { ...prev };
                                        for (const inv of invoices) delete n[inv.id];
                                        return n;
                                      });
                                    }} className="text-[9px] font-medium text-muted-foreground hover:underline">Deselect All</button>
                                  </div>
                                  <span className="text-[10px] tabular-nums text-foreground">
                                    <strong>{selectedInvCount}</strong> selected &middot; <strong>{formatPeso(selectedInvTotal)}</strong>{selectedCmTotal > 0 && <span className="text-muted-foreground"> ({formatPeso(selectedChargeTotal)} - {formatPeso(selectedCmTotal)} CM)</span>}
                                  </span>
                                </div>
                              </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={() => setPayNoSoa(true)} className="mt-1 text-[11px] text-muted-foreground hover:text-primary">{"\uD83D\uDCA1"} Pay against balance (no specific SOA)</button>
                  </div>
                )}
                {payNoSoa && paySoaList.length > 0 && (
                  <p className="mb-4 text-[11px] text-muted-foreground">Paying against general balance. <button onClick={() => setPayNoSoa(false)} className="text-primary hover:underline">Select SOA instead</button></p>
                )}

                {/* Payment Lines */}
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Lines</label>
                    <button onClick={() => { const l = newPayLine(); l.amount = payLines.length === 1 ? payLines[0].amount : ""; setPayLines([...payLines, newPayLine()]); }}
                      className="text-[11px] font-medium text-primary hover:underline">+ Add Method</button>
                  </div>

                  {payLines.map((line, idx) => (
                    <div key={line.id} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-muted-foreground w-5">{idx + 1}.</span>
                        <select value={line.method} onChange={(e) => updatePayLine(line.id, "method", e.target.value)}
                          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none flex-shrink-0">
                          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m] ?? m}</option>)}
                        </select>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">{"\u20B1"}</span>
                          <input type="number" step="0.01" min="0" value={line.amount}
                            onChange={(e) => updatePayLine(line.id, "amount", e.target.value)}
                            className="h-8 w-full rounded-lg border border-border bg-background pl-6 pr-2 text-[13px] font-semibold tabular-nums outline-none focus:border-primary/40" />
                        </div>
                        {payLines.length > 1 && (
                          <button onClick={() => setPayLines(payLines.filter((l) => l.id !== line.id))}
                            className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50"><X size={14} /></button>
                        )}
                      </div>
                      {/* Reference for most methods */}
                      {line.method !== "CASH" && line.method !== "CHECK" && line.method !== "CREDIT_CARD" && (
                        <input type="text" value={line.reference} onChange={(e) => updatePayLine(line.id, "reference", e.target.value)}
                          placeholder="Reference #" className="h-7 w-full rounded border border-border bg-background px-2 text-[11px] outline-none" />
                      )}
                      {/* Check fields */}
                      {line.method === "CHECK" && (
                        <div className="grid grid-cols-3 gap-1.5">
                          <input type="text" value={line.bank} onChange={(e) => updatePayLine(line.id, "bank", e.target.value)} placeholder="Bank" className="h-7 rounded border border-border bg-background px-2 text-[11px]" />
                          <input type="text" value={line.checkNumber} onChange={(e) => updatePayLine(line.id, "checkNumber", e.target.value)} placeholder="Check #" className="h-7 rounded border border-border bg-background px-2 text-[11px]" />
                          <input type="date" value={line.checkDate} onChange={(e) => updatePayLine(line.id, "checkDate", e.target.value)} className="h-7 rounded border border-border bg-background px-2 text-[11px]" />
                        </div>
                      )}
                      {/* Credit card fields */}
                      {line.method === "CREDIT_CARD" && (
                        <div className="grid grid-cols-3 gap-1.5">
                          <select value={line.cardType} onChange={(e) => updatePayLine(line.id, "cardType", e.target.value)} className="h-7 rounded border border-border bg-background px-2 text-[11px]">
                            <option value="">Card type</option>
                            {CARD_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                          </select>
                          <input type="text" value={line.batchNo} onChange={(e) => updatePayLine(line.id, "batchNo", e.target.value)} placeholder="Batch #" className="h-7 rounded border border-border bg-background px-2 text-[11px]" />
                          <input type="text" value={line.traceNo} onChange={(e) => updatePayLine(line.id, "traceNo", e.target.value)} placeholder="Trace #" className="h-7 rounded border border-border bg-background px-2 text-[11px]" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* EWT Section */}
                  <div className="rounded-lg border border-border p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={ewtEnabled} onChange={(e) => {
                        setEwtEnabled(e.target.checked);
                        if (e.target.checked && ewtMode === "difference") {
                          // Auto-calc: SOA total - cash entered
                          const target = paySelectedTotal > 0 ? paySelectedTotal : payOutstanding;
                          const diff = Math.max(0, target - payLinesTotal);
                          setEwtAmount(diff.toFixed(2));
                        }
                      }} className="h-3.5 w-3.5 accent-primary rounded" />
                      <span className="text-[12px] font-medium text-foreground">EWT Deduction</span>
                    </label>
                    {ewtEnabled && (
                      <div className="mt-2 space-y-2">
                        {/* Mode toggle */}
                        <div className="flex rounded-md border border-border bg-muted/30 p-0.5 w-fit">
                          <button onClick={() => {
                            setEwtMode("difference");
                            const target = paySelectedTotal > 0 ? paySelectedTotal : payOutstanding;
                            setEwtAmount(Math.max(0, target - payLinesTotal).toFixed(2));
                          }} className={cn("rounded px-2 py-0.5 text-[10px] font-medium", ewtMode === "difference" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>By Difference</button>
                          <button onClick={() => {
                            setEwtMode("rate");
                            const target = paySelectedTotal > 0 ? paySelectedTotal : payOutstanding;
                            setEwtAmount((target * (parseFloat(ewtRate) / 100)).toFixed(2));
                          }} className={cn("rounded px-2 py-0.5 text-[10px] font-medium", ewtMode === "rate" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>By Rate</button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {ewtMode === "rate" && (
                            <div>
                              <label className="text-[10px] text-muted-foreground">Rate</label>
                              <select value={ewtRate} onChange={(e) => {
                                setEwtRate(e.target.value);
                                const target = paySelectedTotal > 0 ? paySelectedTotal : payOutstanding;
                                const rate = parseFloat(e.target.value) || 0;
                                setEwtAmount((target * (rate / 100)).toFixed(2));
                              }} className="h-7 w-full rounded border border-border bg-background px-2 text-[11px]">
                                <option value="1">1% (Goods)</option>
                                <option value="2">2% (Services)</option>
                                <option value="5">5% (Professional)</option>
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="text-[10px] text-muted-foreground">EWT Amount</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{"\u20B1"}</span>
                              <input type="number" step="0.01" value={ewtAmount} onChange={(e) => setEwtAmount(e.target.value)}
                                className="h-7 w-full rounded border border-border bg-background pl-5 pr-2 text-[11px] font-semibold tabular-nums" />
                            </div>
                            {ewtMode === "difference" && ewtEffectiveRate > 0 && (
                              <span className="text-[9px] text-muted-foreground">~{ewtEffectiveRate.toFixed(2)}% effective rate</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">BIR Form 2307 No. (optional)</label>
                          <input type="text" value={ewtBir} onChange={(e) => setEwtBir(e.target.value)} placeholder="2307-XXXX"
                            className="h-7 w-full rounded border border-border bg-background px-2 text-[11px]" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary Breakdown */}
                  <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-1 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Selected Invoices:</span>
                      <span className="tabular-nums font-medium">{formatPeso(paySelectedTotal)}</span>
                    </div>
                    {payLines.map((line, idx) => (
                      <div key={line.id} className="flex justify-between">
                        <span className="text-muted-foreground">Payment ({METHOD_LABELS[line.method] ?? line.method}):</span>
                        <span className="tabular-nums text-emerald-600">-{formatPeso(line.amount || "0")}</span>
                      </div>
                    ))}
                    {ewtEnabled && payEwtAmt > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">EWT Deduction{ewtMode === "rate" ? ` (${ewtRate}%)` : ""}:</span>
                        <span className="tabular-nums text-emerald-600">-{formatPeso(payEwtAmt)}</span>
                      </div>
                    )}
                    <div className="border-t border-border pt-1 flex justify-between font-medium">
                      <span>Remaining:</span>
                      <span className={cn("tabular-nums", payRemaining === 0 ? "text-emerald-600" : payRemaining < 0 ? "text-red-600" : "text-foreground")}>
                        {payRemaining === 0 ? `${formatPeso(0)} \u2713` : payRemaining > 0 ? `${formatPeso(payRemaining)} remaining` : `Overpayment ${formatPeso(Math.abs(payRemaining))}`}
                      </span>
                    </div>
                  </div>

                  {/* Quick buttons */}
                  <div className="flex gap-2">
                    <button onClick={() => { const l = newPayLine(); l.amount = customer!.currentBalance; setPayLines([l]); }}
                      className="rounded-full px-3 py-0.5 text-[10px] font-medium border border-border hover:bg-muted">Full Payment (Cash)</button>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
                    <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} placeholder="Optional notes..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none outline-none focus:border-primary/40" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
                  <button onClick={closePaymentModal} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                  <button onClick={handlePayReview} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Review Payment {"\u2192"}</button>
                </div>
              </div>
            )}

            {/* ── Step: Confirm ── */}
            {payStep === "confirm" && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">Confirm Payment</h3>
                <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-2 text-[13px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{customer!.name}</span></div>
                  {paySelectedSoas.size > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Applied to</span><span className="font-medium font-mono text-primary">{paySoaList.filter((s) => paySelectedSoas.has(s.id)).map((s) => s.soaNumber).join(", ")}</span></div>}
                  {/* Invoices being settled */}
                  {Object.keys(invoiceAllocs).length > 0 && (() => {
                    const settledInvs = Object.entries(invoiceAllocs).filter(([, amt]) => parseFloat(amt) > 0).map(([txnId, amt]) => {
                      // Find the invoice details from soaInvoices
                      for (const invList of Object.values(soaInvoices)) {
                        const inv = (invList as any[]).find((i: any) => i.id === txnId);
                        if (inv) return { ref: inv.referenceNumber || txnId.slice(0, 8), amount: parseFloat(amt) };
                      }
                      return { ref: txnId.slice(0, 8), amount: parseFloat(amt) };
                    });
                    const invTotal = settledInvs.reduce((s, i) => s + i.amount, 0);
                    return (
                      <div className="border-t border-border pt-2 mt-2">
                        <span className="text-[11px] font-semibold text-muted-foreground">Invoices Settled</span>
                        <div className={cn("mt-1 space-y-0.5", settledInvs.length > 6 && "max-h-32 overflow-y-auto")}>
                          {settledInvs.map((inv, i) => (
                            <div key={i} className="flex justify-between text-[12px]">
                              <span className="font-mono text-foreground">{inv.ref}</span>
                              <span className="tabular-nums text-foreground">{formatPeso(inv.amount)}</span>
                            </div>
                          ))}
                        </div>
                        {settledInvs.length > 1 && (
                          <div className="flex justify-between text-[11px] pt-1 border-t border-border/30 mt-1">
                            <span className="text-muted-foreground">{settledInvs.length} invoices</span>
                            <span className="tabular-nums font-medium">{formatPeso(invTotal)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="border-t border-border pt-2 mt-2 space-y-1">
                    {payLines.map((l, i) => (
                      <div key={l.id} className="flex justify-between text-[12px]">
                        <span className="text-muted-foreground">{METHOD_LABELS[l.method] ?? l.method}{l.reference ? ` (${l.reference})` : ""}{l.checkNumber ? ` #${l.checkNumber}` : ""}{l.batchNo ? ` Batch:${l.batchNo}` : ""}</span>
                        <span className="tabular-nums">{formatPeso(l.amount)}</span>
                      </div>
                    ))}
                    {ewtEnabled && payEwtAmt > 0 && (
                      <div className="flex justify-between text-[12px]">
                        <span className="text-muted-foreground">EWT {ewtRate}%{ewtBir ? ` (BIR 2307: ${ewtBir})` : ""}</span>
                        <span className="tabular-nums">{formatPeso(payEwtAmt)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold pt-1 border-t border-border/50">
                      <span>{ewtEnabled ? "Total Applied" : "Total Payment"}</span>
                      <span className="text-lg text-emerald-600 tabular-nums">{formatPeso(payTotal)}</span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2 mt-2 flex justify-between"><span className="text-muted-foreground">Balance after</span><span className={cn("font-bold", payNewBalance <= 0 ? "text-emerald-600" : "text-foreground")}>{formatPeso(Math.max(0, payNewBalance))}</span></div>
                  {payRemaining > 0 && paySelectedSoas.size > 0 && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                      {"\u26A0"} Partial payment. SOA will be marked as PARTIAL (not PAID). Remaining {formatPeso(payRemaining)} still outstanding.
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 mt-5">
                  <button onClick={() => setPayStep("form")} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">{"\u2190"} Back</button>
                  <button onClick={handlePaySubmit} disabled={payLoading}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                    {payLoading && <Loader2 size={14} className="animate-spin" />}
                    Confirm &amp; Record
                  </button>
                </div>
              </div>
            )}

            {/* ── Step: Success ── */}
            {payStep === "success" && (
              <div className="p-8 text-center">
                <div className="text-5xl mb-3">{"\u2705"}</div>
                <h3 className="text-lg font-semibold mb-1">Payment Recorded</h3>
                {payReceiptData && <p className="text-[11px] font-mono text-muted-foreground mb-1">{payReceiptData.receiptNumber}</p>}
                <p className="text-[15px] font-bold text-emerald-600 mb-1">{formatPeso(payTotal)} &mdash; {payLines.length === 1 ? (METHOD_LABELS[payLines[0].method] ?? payLines[0].method) : "Split Payment"}</p>
                {paySelectedSoas.size > 0 && <p className="text-[12px] text-muted-foreground">Applied to {paySoaList.filter((s) => paySelectedSoas.has(s.id)).map((s) => s.soaNumber).join(", ")}</p>}
                <p className="text-[13px] mt-2">New Balance: <strong className={payNewBalance === 0 ? "text-emerald-600" : ""}>{formatPeso(payNewBalance)}</strong></p>
                <div className="flex justify-center gap-2 mt-6">
                  {payReceiptData && (
                    <button onClick={async () => {
                      // Fetch settled invoices from API (authoritative source)
                      let receiptWithInvoices = { ...payReceiptData! };
                      if (!receiptWithInvoices.settledInvoices || receiptWithInvoices.settledInvoices.length === 0) {
                        try {
                          // Find the payment transaction ID from the receipt number
                          const txRes = await apiFetch<{ data: any[] }>(`/customers/${id}/transactions?type=PAYMENT&limit=5`, { token, locationId });
                          const payTxn = (txRes.data || []).find((t: any) => t.paymentNumber === receiptWithInvoices.receiptNumber);
                          if (payTxn) {
                            const invRes = await apiFetch<{ data: any[] }>(`/customers/${id}/transactions/${payTxn.id}/settled-invoices`, { token, locationId });
                            if (invRes.data && invRes.data.length > 0) {
                              receiptWithInvoices.settledInvoices = invRes.data;
                            }
                          }
                        } catch {}
                      }
                      const html = buildPaymentReceiptHtml(receiptWithInvoices);
                      const w = window.open("", "_blank");
                      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
                    }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">Print Receipt</button>
                  )}
                  <button onClick={closePaymentModal} className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Done</button>
                </div>
              </div>
            )}

            {/* ── Step: Error ── */}
            {payStep === "error" && (
              <div className="p-8 text-center">
                <div className="text-5xl mb-3">{"\u274C"}</div>
                <h3 className="text-lg font-semibold mb-1">Payment Failed</h3>
                <p className="text-[13px] text-muted-foreground mb-1">Unable to record payment.</p>
                {payError && <p className="text-[12px] text-red-600">{payError}</p>}
                <div className="flex justify-center gap-2 mt-6">
                  <button onClick={() => setPayStep("form")} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">{"\u2190"} Back to Edit</button>
                  <button onClick={handlePaySubmit} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Retry</button>
                </div>
              </div>
            )}

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

      {/* ── Record Charge Modal ── */}
      {showChargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Record Charge</h3>
              <button onClick={() => setShowChargeModal(false)} className="rounded-lg p-1 hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {customer?.name}
            </div>
            {chargeError && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {chargeError}
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
                  <input type="date" value={chargeForm.chargeDate} onChange={(e) => setChargeForm((f) => ({ ...f, chargeDate: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount *</label>
                  <input type="number" step="0.01" min="0" value={chargeForm.amount} onChange={(e) => setChargeForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" required />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Invoice / Reference # *</label>
                <input type="text" value={chargeForm.referenceNumber} onChange={(e) => setChargeForm((f) => ({ ...f, referenceNumber: e.target.value }))} placeholder="e.g. INV-2026-001" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
                <input type="text" value={chargeForm.description} onChange={(e) => setChargeForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Service charge, brake pads" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                <textarea value={chargeForm.notes} onChange={(e) => setChargeForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowChargeModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <button
                disabled={chargeSaving || !chargeForm.amount || !chargeForm.referenceNumber.trim()}
                onClick={async () => {
                  setChargeSaving(true);
                  setChargeError("");
                  try {
                    await apiFetch(`/customers/${id}/charges`, { token: token!, locationId: locationId!, method: "POST", body: JSON.stringify({ amount: chargeForm.amount, referenceNumber: chargeForm.referenceNumber.trim(), description: chargeForm.description || undefined, chargeDate: chargeForm.chargeDate || undefined, notes: chargeForm.notes || undefined }) });
                    setShowChargeModal(false);
                    queryClient.invalidateQueries({ queryKey: ["customers", id] });
                    queryClient.invalidateQueries({ queryKey: ["customers", id, "transactions"] });
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Failed to record charge";
                    setChargeError(message);
                  } finally { setChargeSaving(false); }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {chargeSaving ? "Recording..." : "Record Charge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMiniCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background p-3 shadow-sm",
        tone === "danger" ? "border-red-200 bg-red-50/60" : tone === "warning" ? "border-amber-200 bg-amber-50/60" : "border-border",
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-[15px] font-bold tabular-nums", tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-800" : "text-foreground")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CollectionsTab({
  customerId,
  token,
  locationId,
  collectionSummary,
}: {
  customerId: string;
  token: string;
  locationId: string;
  collectionSummary: Customer["collectionSummary"];
}) {
  const queryClient = useQueryClient();
  const notesQuery = useCustomerCollectionNotes(token, locationId, customerId);
  const [noteType, setNoteType] = useState("CALL");
  const [note, setNote] = useState("");
  const [promiseToPayDate, setPromiseToPayDate] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const notes = notesQuery.data?.data ?? [];
  const openNotes = notes.filter((item) => !item.resolvedAt);
  const resolvedNotes = notes.filter((item) => item.resolvedAt);

  const saveNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/customers/${customerId}/collection-notes`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          noteType,
          note: note.trim(),
          promiseToPayDate: promiseToPayDate || null,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
        }),
      });
      setNote("");
      setPromiseToPayDate("");
      setFollowUpAt("");
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "collection-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
    } catch (err: any) {
      setError(err?.message || "Failed to save collection note");
    } finally {
      setSaving(false);
    }
  };

  const resolveNote = async (item: CustomerCollectionNote) => {
    setError("");
    try {
      await apiFetch(`/customers/${customerId}/collection-notes/${item.id}`, {
        method: "PATCH",
        token,
        locationId,
        body: JSON.stringify({ resolved: true }),
      });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "collection-notes"] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
    } catch (err: any) {
      setError(err?.message || "Failed to resolve collection note");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <AccountMiniCard label="Open notes" value={String(collectionSummary?.openNoteCount ?? openNotes.length)} />
        <AccountMiniCard label="Follow-ups due" value={String(collectionSummary?.dueFollowUpCount ?? 0)} tone={(collectionSummary?.dueFollowUpCount ?? 0) > 0 ? "danger" : "neutral"} />
        <AccountMiniCard label="Next follow-up" value={collectionSummary?.nextFollowUpAt ? formatDate(collectionSummary.nextFollowUpAt) : "None"} />
        <AccountMiniCard label="Promise to pay" value={collectionSummary?.promiseToPayDate ? formatDate(collectionSummary.promiseToPayDate) : "None"} tone={collectionSummary?.promiseToPayDate ? "warning" : "neutral"} />
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-3 text-[13px] font-semibold text-foreground">Add collection note</div>
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</div>}
        <div className="grid gap-2 sm:grid-cols-4">
          <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]">
            <option value="CALL">Call</option>
            <option value="SMS">SMS / chat</option>
            <option value="VISIT">Visit</option>
            <option value="PROMISE_TO_PAY">Promise to pay</option>
            <option value="DISPUTE">Dispute</option>
            <option value="NOTE">Note</option>
          </select>
          <input type="date" value={promiseToPayDate} onChange={(e) => setPromiseToPayDate(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Promise to pay date" />
          <input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[12px]" title="Follow-up date/time" />
          <button type="button" onClick={saveNote} disabled={saving || !note.trim()} className="h-9 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What happened, who was contacted, and what should happen next?" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      </div>

      <CollectionNoteList title="Open collection notes" notes={openNotes} onResolve={resolveNote} />
      {resolvedNotes.length > 0 && <CollectionNoteList title="Resolved history" notes={resolvedNotes} />}
    </div>
  );
}

function CollectionNoteList({
  title,
  notes,
  onResolve,
}: {
  title: string;
  notes: CustomerCollectionNote[];
  onResolve?: (note: CustomerCollectionNote) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-[12px] font-semibold text-foreground">{title}</div>
      {notes.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No notes in this section.</div>
      ) : (
        <div className="divide-y divide-border">
          {notes.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{item.noteType}</span>
                  {item.promiseToPayDate && <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">Promise {formatDate(item.promiseToPayDate)}</span>}
                  {item.followUpAt && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Follow {formatDate(item.followUpAt)}</span>}
                  <span className="text-[11px] text-muted-foreground">by {item.createdByName ?? "Unknown"} · {item.createdAt ? formatDate(item.createdAt) : ""}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">{item.note}</p>
                {item.resolvedAt && <p className="mt-1 text-[11px] text-muted-foreground">Resolved {formatDate(item.resolvedAt)} by {item.resolvedByName ?? "Unknown"}</p>}
              </div>
              {onResolve && !item.resolvedAt && (
                <button type="button" onClick={() => onResolve(item)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineTab({ customerId, token, locationId }: { customerId: string; token: string; locationId: string }) {
  const timelineQuery = useCustomerTimeline(token, locationId, customerId);
  const events = timelineQuery.data?.data ?? [];

  if (timelineQuery.isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading account timeline...</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-[12px] font-semibold text-foreground">Account timeline</div>
      {events.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No timeline events found.</div>
      ) : (
        <div className="divide-y divide-border">
          {events.map((event: CustomerTimelineEvent) => (
            <div key={event.id} className="flex gap-3 px-4 py-3">
              <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground">{event.title}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{event.source.replace("_", " ")}</span>
                  {event.reference && <span className="text-[11px] text-muted-foreground">{event.reference}</span>}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{formatDate(event.occurredAt)}</div>
                {typeof event.amount === "number" && event.amount !== 0 && <div className="mt-1 text-[12px] font-semibold tabular-nums text-foreground">{formatPeso(Math.abs(event.amount))}</div>}
                {typeof event.details?.note === "string" && <p className="mt-1 text-[12px] text-muted-foreground">{event.details.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({
  customerId,
  token,
  locationId,
  customerName,
  customerCode,
}: {
  customerId: string;
  token: string;
  locationId: string;
  customerName: string;
  customerCode: string;
}) {
  const documentsQuery = useCustomerDocuments(token, locationId, customerId);
  const notesQuery = useCustomerCollectionNotes(token, locationId, customerId);
  const [documentFilter, setDocumentFilter] = useState<CustomerDocumentRow["documentType"] | "ALL">("ALL");
  const documents = documentsQuery.data?.data ?? [];
  const filteredDocuments = documents.filter((doc) => documentFilter === "ALL" || doc.documentType === documentFilter);

  const reprint = async (doc: CustomerDocumentRow, mode: CustomerSOAPrintMode = "detailed") => {
    if (doc.documentType === "SOA") {
      const soaRes = await apiFetch<any>(`/customers/reports/soa-by-id/${doc.id}`, { token, locationId });
      const html = mode === "concise"
        ? buildConciseCustomerSOAHtml({
            customer: soaRes.customer,
            transactions: soaRes.transactions,
            from: soaRes.from,
            to: soaRes.to,
            soaNumber: soaRes.soaNumber,
          })
        : buildSOAHtml({
            customer: soaRes.customer,
            transactions: soaRes.transactions,
            openingBalance: soaRes.openingBalance,
            closingBalance: soaRes.closingBalance,
            from: soaRes.from,
            to: soaRes.to,
            soaNumber: soaRes.soaNumber,
          });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
      return;
    }
    if (doc.documentType === "PAYMENT_RECEIPT") {
      const txRes = await apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions?type=PAYMENT&limit=200`, { token, locationId });
      const payment = (txRes.data || []).find((tx) => tx.id === doc.id);
      if (!payment) return;
      const invRes = await apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions/${payment.id}/settled-invoices`, { token, locationId });
      const html = buildPaymentReceiptHtml({
        receiptNumber: payment.paymentNumber || "PAY-N/A",
        date: payment.recordedAt,
        customer: { name: customerName, code: customerCode },
        amount: Math.abs(parseFloat(payment.amount)),
        method: payment.paymentMethod || "CASH",
        referenceNumber: payment.referenceNumber || undefined,
        paymentLines: payment.paymentLines || undefined,
        soaApplications: [],
        settledInvoices: invRes.data || [],
        previousBalance: parseFloat(payment.balanceAfter) + Math.abs(parseFloat(payment.amount)),
        newBalance: parseFloat(payment.balanceAfter),
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
      return;
    }
    if (doc.documentType === "CREDIT_MEMO") {
      const html = buildCustomerCreditMemoHtml({
        customerName,
        number: doc.number,
        amount: doc.amount,
        date: doc.date,
        status: doc.status,
        notes: typeof doc.metadata?.notes === "string" ? doc.metadata.notes : null,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
      return;
    }
    if (doc.documentType === "COLLECTION_SUMMARY") {
      const html = buildCustomerCollectionNotesHtml(customerName, notesQuery.data?.data ?? []);
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
      return;
    }
    if (doc.documentType === "DISPUTE") {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Customer Dispute - ${customerName}</title><style>
        body{font-family:Arial,sans-serif;margin:48px;color:#111827}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}td{border-bottom:1px solid #e5e7eb;padding:10px 0;font-size:14px}.label{font-weight:700;color:#6b7280;width:180px}.amount{font-size:24px;font-weight:800;color:#991b1b}.note{margin-top:28px;border:1px solid #e5e7eb;border-radius:10px;padding:14px;color:#374151}
      </style></head><body>
        <h1>Customer Dispute Record</h1>
        <div>${customerName}</div>
        <table>
          <tr><td class="label">Reason</td><td>${doc.title.replace(/^Dispute - /, "")}</td></tr>
          <tr><td class="label">Status</td><td>${doc.status ?? "Open"}</td></tr>
          <tr><td class="label">Date</td><td>${doc.date ? formatDate(doc.date) : ""}</td></tr>
          <tr><td class="label">Amount</td><td class="amount">${formatPeso(doc.amount)}</td></tr>
        </table>
        <div class="note">This record flags a customer invoice/SOA dispute. It does not adjust the account balance by itself.</div>
      </body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    }
  };

  if (documentsQuery.isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading documents...</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
        <div className="text-[12px] font-semibold text-foreground">Document center</div>
        <select
          value={documentFilter}
          onChange={(event) => setDocumentFilter(event.target.value as CustomerDocumentRow["documentType"] | "ALL")}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground"
        >
          <option value="ALL">All documents</option>
          <option value="SOA">SOAs</option>
          <option value="PAYMENT_RECEIPT">Receipts</option>
          <option value="CREDIT_MEMO">Credit memos</option>
          <option value="DISPUTE">Disputes</option>
          <option value="COLLECTION_SUMMARY">Collection summaries</option>
        </select>
      </div>
      {filteredDocuments.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No SOAs, receipts, or credit memos found.</div>
      ) : (
        <div className="divide-y divide-border">
          {filteredDocuments.map((doc) => (
            <div key={`${doc.documentType}-${doc.id}`} className="flex items-center gap-3 px-4 py-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-foreground">{doc.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{doc.date ? formatDate(doc.date) : ""} · {doc.status ?? "Record"}</div>
              </div>
              <div className="w-28 text-right font-semibold tabular-nums text-foreground">{formatPeso(doc.amount)}</div>
              {doc.documentType === "SOA" ? (
                <div className="flex gap-1">
                  <button type="button" onClick={() => void reprint(doc, "detailed")} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted">
                    Detailed
                  </button>
                  <button type="button" onClick={() => void reprint(doc, "concise")} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted">
                    Concise
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void reprint(doc)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted">
                  Reprint
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SOAWorkspaceHandoffTab({
  customer,
  customerId,
  token,
  locationId,
  currentBalance,
  unbilledCount,
  creditMemoCount,
  safetyAlerts,
  onOpenWorkspace,
  onCompleteProfile,
  onRecordPayment,
  onViewCreditMemos,
}: {
  customer: Customer;
  customerId: string;
  token: string;
  locationId: string;
  currentBalance: number;
  unbilledCount: number;
  creditMemoCount: number;
  safetyAlerts: string[];
  onOpenWorkspace: () => void;
  onCompleteProfile: () => void;
  onRecordPayment: () => void;
  onViewCreditMemos: () => void;
}) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch<{ data: any[] }>(`/customers/${customerId}/soa/history`, { token, locationId })
      .then((res) => {
        if (!mounted) return;
        setHistory(res.data || []);
      })
      .catch(() => {
        if (mounted) setHistory([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [customerId, token, locationId]);

  const lastSoa = history[0];
  const lastSoaLabel = lastSoa
    ? `${lastSoa.soaNumber || "SOA"} · ${formatDate(lastSoa.generatedAt || lastSoa.dateTo || lastSoa.dateFrom)}`
    : "None yet";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-blue-950 shadow-sm dark:border-blue-900 dark:bg-blue-950/25 dark:text-blue-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">SOA generation moved to the Customer SOA workspace</div>
            <p className="mt-1 max-w-2xl text-[12px] text-blue-900/80 dark:text-blue-100/80">
              This tab is now an account handoff only. Previewing, selecting charges, applying credit memos, and generating new customer SOAs all happen in one canonical workspace so billing decisions are not split across two screens.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
          >
            Open SOA Workspace
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Current balance</div>
          <div className={cn("mt-1 text-xl font-bold tabular-nums", currentBalance > 0 ? "text-red-600" : "text-emerald-600")}>
            {formatPeso(currentBalance)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Unbilled charges</div>
          <div className={cn("mt-1 text-xl font-bold tabular-nums", unbilledCount > 0 ? "text-amber-700" : "text-foreground")}>
            {unbilledCount}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Credit memos</div>
          <div className={cn("mt-1 text-xl font-bold tabular-nums", creditMemoCount > 0 ? "text-emerald-700" : "text-foreground")}>
            {creditMemoCount}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Last SOA</div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">
            {loading ? "Loading..." : lastSoaLabel}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-foreground">Account readiness</div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {safetyAlerts.length > 0
                ? "Resolve these before releasing customer billing or payments."
                : "No obvious account safety issues detected from the loaded profile."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCompleteProfile} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold hover:bg-muted">
              Complete Profile
            </button>
            <button type="button" onClick={onViewCreditMemos} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-100">
              View Credit Memos
            </button>
            {currentBalance > 0 && (
              <button type="button" onClick={onRecordPayment} className="rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-800">
                Record Payment
              </button>
            )}
          </div>
        </div>
        {safetyAlerts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {safetyAlerts.map((alert) => (
              <span key={alert} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                {alert}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-[12px] text-muted-foreground">
        Customer name clicks remain the master/detail account profile. Use this page for profile, ledger, payments, credit memos, and history; use `/customers/soa` for billing operations.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * Credit Memos Tab Component
 * ═══════════════════════════════════════════════════════ */
function CreditMemosTab({ customerId, token, locationId }: { customerId: string; token: string; locationId: string }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creditFilter, setCreditFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [cmDate, setCmDate] = useState(new Date().toISOString().slice(0, 10));
  const [cmNumber, setCmNumber] = useState("");
  const [cmInvoice, setCmInvoice] = useState("");
  const [cmAmount, setCmAmount] = useState("");
  const [cmNotes, setCmNotes] = useState("");
  const [cmError, setCmError] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "300");
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions?${params.toString()}`, { token, locationId })
      .then((res) => setTxns((res.data || []).filter(isCustomerCreditMemoLike).sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [customerId, token, locationId, dateFrom, dateTo]);

  const filteredTxns = txns.filter((t) => {
    if (creditFilter === "available") return t.type === "CREDIT_NOTE" && !t.billed;
    if (creditFilter === "applied") return t.type === "CREDIT_NOTE" && t.billed;
    if (creditFilter === "manual") return t.type === "ADJUSTMENT";
    if (creditFilter === "missing_ref") return !creditMemoInvoiceRef(t.notes);
    return true;
  });
  const totalCM = filteredTxns.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const availableCredits = txns.filter((t) => t.type === "CREDIT_NOTE" && !t.billed);
  const appliedCredits = txns.filter((t) => t.type === "CREDIT_NOTE" && t.billed);
  const manualCredits = txns.filter((t) => t.type === "ADJUSTMENT");
  const availableTotal = availableCredits.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const appliedOrAdjustedTotal = [...appliedCredits, ...manualCredits].reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const missingRefCount = txns.filter((t) => !creditMemoInvoiceRef(t.notes)).length;

  const handleAddCM = async () => {
    const amount = Math.abs(parseFloat(cmAmount));
    if (!cmNumber || !Number.isFinite(amount) || amount <= 0) return;
    setCmError("");
    setSaving(true);
    try {
      await apiFetch(`/customers/${customerId}/adjustments`, {
        method: "POST", token, locationId,
        body: JSON.stringify({
          amount: `-${amount.toFixed(2)}`,
          notes: `Credit Memo ${cmNumber}${cmDate ? ` dated ${formatDate(cmDate)}` : ""}${cmInvoice ? ` against invoice ${cmInvoice}` : ""}${cmNotes ? `. ${cmNotes}` : ""}`,
        }),
      });
      setShowAdd(false); setCmDate(new Date().toISOString().slice(0, 10)); setCmNumber(""); setCmInvoice(""); setCmAmount(""); setCmNotes("");
      fetchData();
      queryClient.invalidateQueries({ queryKey: ["customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "transactions"] });
    } catch (err: unknown) {
      setCmError(err instanceof Error ? err.message : "Failed to record credit memo");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
        <select
          value={creditFilter}
          onChange={(e) => setCreditFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
        >
          <option value="">All credit memos</option>
          <option value="available">Available for SOA</option>
          <option value="applied">Applied to SOA</option>
          <option value="manual">Used / Settled</option>
          <option value="missing_ref">Missing invoice ref</option>
        </select>
        <button onClick={() => setShowAdd(!showAdd)} className="h-8 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90">+ Record Credit Memo</button>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Available for SOA</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-600">{formatPeso(availableTotal)}</div>
          <div className="text-[10px] text-muted-foreground">{availableCredits.length} credit memo{availableCredits.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Applied / used</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatPeso(appliedOrAdjustedTotal)}</div>
          <div className="text-[10px] text-muted-foreground">{appliedCredits.length} applied to SOA, {manualCredits.length} used / settled</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Missing invoice ref</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-amber-700">{missingRefCount}</div>
          <div className="text-[10px] text-muted-foreground">Add invoice refs when known for easier reconciliation</div>
        </div>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-primary/20 bg-primary/[0.02] p-4 space-y-2">
          <h4 className="text-[13px] font-semibold">New Credit Memo</h4>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Manual credit memos reduce the customer balance immediately. Credit-note rows marked "Available for SOA" can be selected into an SOA; used / settled rows are shown here for audit clarity.
          </div>
          {cmError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{cmError}</div>}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Date</label>
              <input type="date" value={cmDate} onChange={(e) => setCmDate(e.target.value)} className="h-8 w-full rounded border border-border bg-background px-2 text-[12px]" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">CM Number *</label>
              <input type="text" value={cmNumber} onChange={(e) => setCmNumber(e.target.value)} placeholder="CM-XXXX" className="h-8 w-full rounded border border-border bg-background px-2 text-[12px]" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Original Invoice #</label>
              <input type="text" value={cmInvoice} onChange={(e) => setCmInvoice(e.target.value)} placeholder="Q-XXXX" className="h-8 w-full rounded border border-border bg-background px-2 text-[12px]" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Amount *</label>
              <input type="number" step="0.01" value={cmAmount} onChange={(e) => setCmAmount(e.target.value)} placeholder="0.00" className="h-8 w-full rounded border border-border bg-background px-2 text-[12px]" />
            </div>
          </div>
          <input type="text" value={cmNotes} onChange={(e) => setCmNotes(e.target.value)} placeholder="Reason / Notes (optional)" className="h-8 w-full rounded border border-border bg-background px-2 text-[12px]" />
          <div className="flex gap-2">
            <button onClick={handleAddCM} disabled={saving || !cmNumber || !cmAmount} className="h-8 rounded bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            <button onClick={() => setShowAdd(false)} className="h-8 rounded border border-border px-3 text-[12px] text-muted-foreground hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <div className="w-24">Date</div>
          <div className="w-28">CM #</div>
          <div className="flex-1">Reference Invoice</div>
          <div className="w-24 text-right">Amount</div>
          <div className="w-32 text-center">Status</div>
          <div className="w-40">Notes</div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filteredTxns.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {txns.length === 0 ? "No credit memos found." : "No credit memos match the selected filter."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTxns.map((t) => {
              const invoiceRef = creditMemoInvoiceRef(t.notes);
              const status = creditMemoStatus(t);
              return (
                <div key={t.id} className="flex items-center px-4 py-1.5 text-[13px] hover:bg-accent/20">
                  <div className="w-24 text-[12px] text-muted-foreground">{formatDate(t.recordedAt)}</div>
                  <div className="w-28 font-mono text-[12px] font-semibold text-amber-700">{creditMemoNumber(t)}</div>
                  <div className="flex-1 text-[12px] text-foreground">{invoiceRef ?? "\u2014"}</div>
                  <div className="w-24 text-right tabular-nums font-medium text-emerald-600">{formatPeso(Math.abs(parseFloat(t.amount)))}</div>
                  <div className="w-32 text-center">
                    <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase", status.classes)}>
                      {status.label}
                    </span>
                  </div>
                  <div className="w-40 text-[11px] text-muted-foreground truncate">
                    {t.billedSoaId ? `SOA linked: ${String(t.billedSoaId).slice(0, 8)}` : (t.notes || "")}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredTxns.length > 0 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-[12px]">
            <span className="text-muted-foreground">{filteredTxns.length} credit memo{filteredTxns.length !== 1 ? "s" : ""}</span>
            <span className="tabular-nums font-medium text-amber-600">Total: {formatPeso(totalCM)}</span>
          </div>
        )}
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * Payment History Tab Component
 * ═══════════════════════════════════════════════════════ */
function PaymentHistoryTab({ customerId, token, locationId, customerName, customerCode }: { customerId: string; token: string; locationId: string; customerName: string; customerCode: string }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [paymentLinkFilter, setPaymentLinkFilter] = useState("");
  const [allocationPayment, setAllocationPayment] = useState<any | null>(null);
  const [allocationRows, setAllocationRows] = useState<CustomerPaymentAllocationDetail[]>([]);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState("");
  const [reversalPayment, setReversalPayment] = useState<any | null>(null);
  const [reversalKind, setReversalKind] = useState<"reverse" | "bounce">("reverse");
  const [reversalPreview, setReversalPreview] = useState<CustomerPaymentReversalPreview | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalApplying, setReversalApplying] = useState(false);
  const [reversalError, setReversalError] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("type", "PAYMENT");
    params.set("limit", "200");
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions?${params.toString()}`, { token, locationId })
      .then((res) => setTxns((res.data || []).sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId, token, locationId, dateFrom, dateTo]);

  const METHOD_LABELS: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank Transfer", CHECK: "Check", CREDIT_CARD: "Credit Card", GCASH: "GCash", MAYA: "Maya", QRPH: "QRPH", OTHER: "Other" };
  const paymentLinesFor = (t: any) => (Array.isArray(t.paymentLines) ? t.paymentLines : []) as any[];
  const primaryPaymentMethod = (t: any) => {
    const lines = paymentLinesFor(t).filter((line: any) => line.method !== "EWT");
    if (lines.length > 1) return "SPLIT";
    if (lines.length === 1) return lines[0].method ?? "";
    return t.paymentMethod ?? "";
  };
  const visibleTxns = txns.filter((t) => {
    const soaRefs = extractSoaRefs(t.notes);
    if (paymentLinkFilter === "soa_linked" && soaRefs.length === 0) return false;
    if (paymentLinkFilter === "balance" && soaRefs.length > 0) return false;
    if (!methodFilter) return true;
    const lines = paymentLinesFor(t);
    if (methodFilter === "EWT") return lines.some((line: any) => line.method === "EWT");
    if (methodFilter === "SPLIT") return lines.filter((line: any) => line.method !== "EWT").length > 1;
    return primaryPaymentMethod(t) === methodFilter;
  });
  const totalPayments = visibleTxns.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const splitPaymentCount = visibleTxns.filter((t) => primaryPaymentMethod(t) === "SPLIT").length;
  const ewtPaymentCount = visibleTxns.filter((t) => paymentLinesFor(t).some((line: any) => line.method === "EWT")).length;
  const soaLinkedCount = visibleTxns.filter((t) => extractSoaRefs(t.notes).length > 0).length;
  const balancePaymentCount = visibleTxns.length - soaLinkedCount;
  const methodSummaryLabel = methodFilter === "SPLIT" ? "Split payments" : methodFilter === "EWT" ? "With EWT" : methodFilter ? (METHOD_LABELS[methodFilter] ?? methodFilter) : "All payment methods";

  const openAllocationDetails = async (payment: any) => {
    setAllocationPayment(payment);
    setAllocationRows([]);
    setAllocationError("");
    setAllocationLoading(true);
    try {
      const res = await apiFetch<{ data: CustomerPaymentAllocationDetail[] }>(
        `/customers/${customerId}/transactions/${payment.id}/settled-invoices`,
        { token, locationId },
      );
      setAllocationRows(res.data || []);
    } catch (err: any) {
      setAllocationError(err?.message || "Failed to load payment allocations");
    } finally {
      setAllocationLoading(false);
    }
  };

  const openReversalPreview = async (payment: any, kind: "reverse" | "bounce" = "reverse") => {
    setReversalPayment(payment);
    setReversalKind(kind);
    setReversalPreview(null);
    setReversalReason(kind === "bounce" ? "Bounced check" : "");
    setReversalError("");
    setReversalLoading(true);
    try {
      const preview = await apiFetch<CustomerPaymentReversalPreview>(
        `/customers/${customerId}/transactions/${payment.id}/${kind === "bounce" ? "bounce" : "reverse"}`,
        {
          method: "POST",
          token,
          locationId,
          body: JSON.stringify({ mode: "preview" }),
        },
      );
      setReversalPreview(preview);
    } catch (err: any) {
      setReversalError(err?.message || "Failed to preview payment reversal");
    } finally {
      setReversalLoading(false);
    }
  };

  const applyReversal = async () => {
    if (!reversalPayment || !reversalReason.trim()) return;
    setReversalApplying(true);
    setReversalError("");
    try {
      await apiFetch<CustomerPaymentReversalPreview>(
        `/customers/${customerId}/transactions/${reversalPayment.id}/${reversalKind === "bounce" ? "bounce" : "reverse"}`,
        {
          method: "POST",
          token,
          locationId,
          body: JSON.stringify({ mode: "apply", reason: reversalReason.trim() }),
        },
      );
      setReversalPayment(null);
      setReversalPreview(null);
      setReversalReason("");
      const params = new URLSearchParams();
      params.set("type", "PAYMENT");
      params.set("limit", "200");
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const refreshed = await apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions?${params.toString()}`, { token, locationId });
      setTxns((refreshed.data || []).sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()));
      queryClient.invalidateQueries({ queryKey: ["customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "transactions"] });
    } catch (err: any) {
      setReversalError(err?.message || "Failed to reverse payment");
    } finally {
      setReversalApplying(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
        >
          <option value="">All methods</option>
          <option value="CASH">Cash</option>
          <option value="CHECK">Check</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="CREDIT_CARD">Credit Card</option>
          <option value="GCASH">GCash</option>
          <option value="MAYA">Maya</option>
          <option value="QRPH">QRPH</option>
          <option value="SPLIT">Split payments</option>
          <option value="EWT">With EWT</option>
          <option value="OTHER">Other</option>
        </select>
        <select
          value={paymentLinkFilter}
          onChange={(e) => setPaymentLinkFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
        >
          <option value="">All payment links</option>
          <option value="soa_linked">SOA-linked</option>
          <option value="balance">Balance payment</option>
        </select>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Payment records</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{visibleTxns.length}</div>
          <div className="text-[10px] text-muted-foreground">{methodSummaryLabel}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Collected</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-600">{formatPeso(totalPayments)}</div>
          <div className="text-[10px] text-muted-foreground">{dateFrom || dateTo ? "Filtered period" : "Loaded records"}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">SOA-linked / balance</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{soaLinkedCount} / {balancePaymentCount}</div>
          <div className="text-[10px] text-muted-foreground">Split: {splitPaymentCount} · EWT: {ewtPaymentCount}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <div className="w-24">Date</div>
          <div className="w-28">Receipt #</div>
          <div className="w-20">Type</div>
          <div className="w-20">Method</div>
          <div className="flex-1">Reference</div>
          <div className="w-24 text-right">Amount</div>
          <div className="w-32">Notes</div>
          <div className="w-36 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : visibleTxns.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {txns.length === 0 ? "No payments found." : "No payments match the selected method."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleTxns.map((t) => {
              const soaRefs = extractSoaRefs(t.notes);
              return (
              <div key={t.id} className="flex items-center px-4 py-1.5 text-[13px] hover:bg-accent/20">
                <div className="w-24 text-[12px] text-muted-foreground">{formatDate(t.recordedAt)}</div>
                <div className="w-28 font-mono text-[11px] text-primary">{t.paymentNumber || "\u2014"}</div>
                <div className="w-20">
                  <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                    t.type === "PAYMENT" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                    {t.type === "PAYMENT" ? "Payment" : "CN"}
                  </span>
                </div>
                <div className="w-20 text-[11px] text-muted-foreground">
                  {t.type === "PAYMENT" ? (() => {
                    const pl = t.paymentLines as any[] | null;
                    if (pl && pl.length > 1) {
                      const nonEwt = pl.filter((l: any) => l.method !== "EWT");
                      return nonEwt.length > 1 ? "Split" : (METHOD_LABELS[nonEwt[0]?.method] ?? nonEwt[0]?.method ?? "Split");
                    }
                    if (pl && pl.length === 1) return METHOD_LABELS[pl[0].method] ?? pl[0].method;
                    return METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod ?? "\u2014";
                  })() : "\u2014"}
                </div>
                <div className="flex-1 text-[12px] text-foreground truncate">
                  {(() => {
                    const pl = t.paymentLines as any[] | null;
                    if (pl && pl.length >= 1) {
                      const mainLine = pl.find((l: any) => l.method !== "EWT") || pl[0];
                      if (mainLine.method === "CHECK") {
                        const parts: string[] = [];
                        if (mainLine.bank) parts.push(mainLine.bank);
                        if (mainLine.checkNumber) parts.push(`#${mainLine.checkNumber}`);
                        return parts.length > 0 ? parts.join(" ") : (t.referenceNumber || "\u2014");
                      }
                      if (mainLine.method === "CREDIT_CARD") {
                        const parts: string[] = [];
                        if (mainLine.cardType) parts.push(mainLine.cardType);
                        if (mainLine.batchNumber) parts.push(`Batch: ${mainLine.batchNumber}`);
                        return parts.length > 0 ? parts.join(" ") : (t.referenceNumber || "\u2014");
                      }
                      if (mainLine.reference) return mainLine.reference;
                    }
                    return t.referenceNumber || "\u2014";
                  })()}
                </div>
                <div className="w-24 text-right tabular-nums font-medium text-emerald-600">{formatPeso(Math.abs(parseFloat(t.amount)))}</div>
                <div className="w-32 text-[11px] text-muted-foreground truncate">
                  {soaRefs.length > 0 ? (
                    <span className="inline-flex rounded-md bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-700">
                      SOA {soaRefs.join(", ")}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                      Balance payment
                    </span>
                  )}
                </div>
                <div className="flex w-36 justify-end gap-1 text-right">
                  {t.type === "PAYMENT" && (
                    <>
                    <button
                      type="button"
                      onClick={() => openAllocationDetails(t)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Details
                    </button>
                    <button onClick={async () => {
                      const amt = Math.abs(parseFloat(t.amount));
                      const prevBal = parseFloat(t.balanceAfter) + amt;
                      const soaMatch = (t.notes || "").match(/\[SOA:\s*([^\]]+)\]/);
                      const soaApps = soaMatch
                        ? soaMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean).map((num: string) => ({ soaNumber: num, period: "", amount: 0 }))
                        : [];
                      // Fetch settled invoices from API
                      let settledInvoices: Array<{ referenceNumber: string; amount: number }> | undefined;
                      try {
                        const invRes = await apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions/${t.id}/settled-invoices`, { token, locationId });
                        if (invRes.data && invRes.data.length > 0) settledInvoices = invRes.data;
                      } catch {}
                      const html = buildPaymentReceiptHtml({
                        receiptNumber: t.paymentNumber || "PAY-N/A",
                        date: t.recordedAt,
                        customer: { name: customerName, code: customerCode },
                        amount: amt,
                        method: t.paymentMethod || "CASH",
                        referenceNumber: t.referenceNumber || undefined,
                        cardType: t.cardType || undefined,
                        batchNumber: t.batchNumber || undefined,
                        traceNumber: t.traceNumber || undefined,
                        paymentLines: t.paymentLines ? (t.paymentLines as any[]).map((l: any) => ({
                          method: l.method, amount: parseFloat(l.amount) || 0,
                          reference: l.reference, bank: l.bank, checkNumber: l.checkNumber, checkDate: l.checkDate,
                          cardType: l.cardType, batchNumber: l.batchNumber, traceNumber: l.traceNumber,
                          rate: l.rate, bir2307: l.bir2307, baseAmount: l.baseAmount,
                        })) : undefined,
                        soaApplications: soaApps,
                        settledInvoices,
                        previousBalance: prevBal,
                        newBalance: parseFloat(t.balanceAfter),
                      });
                      const w = window.open("", "_blank");
                      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
                    }} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">Print</button>
                    <button
                      type="button"
                      onClick={() => void openReversalPreview(t, "reverse")}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-50"
                    >
                      Reverse
                    </button>
                    {primaryPaymentMethod(t) === "CHECK" && (
                      <button
                        type="button"
                        onClick={() => void openReversalPreview(t, "bounce")}
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-orange-800 hover:bg-orange-50"
                      >
                        Bounced
                      </button>
                    )}
                    </>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}

        {visibleTxns.length > 0 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-[12px]">
            <span className="text-muted-foreground">{visibleTxns.length} record{visibleTxns.length !== 1 ? "s" : ""}</span>
            <div className="flex gap-4 tabular-nums font-medium">
              {totalPayments > 0 && <span className="text-emerald-600">Total Payments: {formatPeso(totalPayments)}</span>}
            </div>
          </div>
        )}
      </div>

      {allocationPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Payment allocation details</div>
                <h3 className="mt-1 text-lg font-bold text-foreground">{allocationPayment.paymentNumber || allocationPayment.referenceNumber || "Payment"}</h3>
                <p className="text-[12px] text-muted-foreground">
                  {formatDate(allocationPayment.recordedAt)} - {formatPeso(Math.abs(parseFloat(allocationPayment.amount)))}
                </p>
              </div>
              <button type="button" onClick={() => setAllocationPayment(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              {allocationLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Loading allocations...
                </div>
              ) : allocationError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{allocationError}</div>
              ) : allocationRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-[13px] text-slate-700">
                  No invoice-level allocation rows were found. This may be a balance payment or an older payment record without allocation detail.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="grid grid-cols-[minmax(160px,1fr)_110px_120px_120px] border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    <div>Invoice / charge</div>
                    <div>SOA</div>
                    <div className="text-right">Applied</div>
                    <div className="text-right">Remaining</div>
                  </div>
                  <div className="divide-y divide-border">
                    {allocationRows.map((row) => (
                      <div key={row.chargeTransactionId} className="grid grid-cols-[minmax(160px,1fr)_110px_120px_120px] items-center px-3 py-2 text-[12px]">
                        <div>
                          <div className="font-mono font-semibold text-foreground">{row.referenceNumber || "N/A"}</div>
                          {row.chargeDate && <div className="text-[10px] text-muted-foreground">{formatDate(row.chargeDate)}</div>}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">{row.soaNumber || "Balance"}</div>
                        <div className="text-right font-bold tabular-nums text-emerald-700">{formatPeso(row.amount)}</div>
                        <div className="text-right tabular-nums text-muted-foreground">{formatPeso(row.remainingAfterAllocation ?? 0)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-[12px] font-semibold">
                    <span className="text-muted-foreground">{allocationRows.length} allocated invoice{allocationRows.length !== 1 ? "s" : ""}</span>
                    <span className="tabular-nums text-emerald-700">
                      Total applied: {formatPeso(allocationRows.reduce((sum, row) => sum + row.amount, 0))}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-950">
                This is a read-only allocation preview. Reversal or void actions should use a dedicated safe modal that lists affected SOAs and invoices before changing financial records.
              </div>
            </div>
          </div>
        </div>
      )}

      {reversalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-red-700">
                  {reversalKind === "bounce" ? "Bounced check safety check" : "Payment reversal safety check"}
                </div>
                <h3 className="mt-1 text-lg font-bold text-foreground">{reversalPayment.paymentNumber || reversalPayment.referenceNumber || "Payment"}</h3>
                <p className="text-[12px] text-muted-foreground">
                  {reversalKind === "bounce"
                    ? "Review affected invoices and SOAs before marking this check as bounced and removing its payment effect."
                    : "Review affected invoices and SOAs before removing this payment from the account."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReversalPayment(null);
                  setReversalPreview(null);
                  setReversalError("");
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              {reversalLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Building reversal preview...
                </div>
              ) : reversalError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{reversalError}</div>
              ) : reversalPreview ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <AccountMiniCard label="Payment amount" value={formatPeso(reversalPreview.payment.amount)} />
                    <AccountMiniCard label="Current balance" value={formatPeso(reversalPreview.customer.oldBalance)} />
                    <AccountMiniCard label="Balance after reversal" value={formatPeso(reversalPreview.customer.newBalance)} tone="warning" />
                  </div>

                  {reversalPreview.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-950">
                      {reversalPreview.warnings.map((warning) => (
                        <div key={warning}>Warning: {warning}</div>
                      ))}
                    </div>
                  )}

                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="grid grid-cols-[minmax(160px,1fr)_120px_120px_120px] border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      <div>Affected invoice</div>
                      <div>SOA</div>
                      <div className="text-right">Applied</div>
                      <div className="text-right">Charge amount</div>
                    </div>
                    {reversalPreview.allocations.length === 0 ? (
                      <div className="px-3 py-5 text-center text-[12px] text-muted-foreground">No allocation rows found for this payment.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {reversalPreview.allocations.map((row) => (
                          <div key={`${row.chargeTransactionId}-${row.amount}`} className="grid grid-cols-[minmax(160px,1fr)_120px_120px_120px] items-center px-3 py-2 text-[12px]">
                            <div>
                              <div className="font-mono font-semibold text-foreground">{row.referenceNumber || "N/A"}</div>
                              {row.chargeDate && <div className="text-[10px] text-muted-foreground">{formatDate(row.chargeDate)}</div>}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">{row.soaNumber || "Balance"}</div>
                            <div className="text-right font-bold tabular-nums text-red-700">{formatPeso(row.amount)}</div>
                            <div className="text-right tabular-nums text-muted-foreground">{formatPeso(row.chargeAmount ?? 0)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {reversalPreview.affectedSoas.length > 0 && (
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="text-[12px] font-bold text-foreground">SOA statuses to recompute</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {reversalPreview.affectedSoas.map((soa) => (
                          <span key={soa.id} className="rounded-md border border-slate-300 bg-background px-2 py-1 text-[11px] font-semibold text-foreground">
                            {soa.soaNumber} - {soa.status || "status"} - paid {formatPeso(soa.paidAmount)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Reason required to reverse
                    </label>
                    <textarea
                      value={reversalReason}
                      onChange={(event) => setReversalReason(event.target.value)}
                      rows={3}
                      placeholder="Example: Duplicate payment entry, wrong customer, bounced check..."
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-red-300"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
              <button
                type="button"
                onClick={() => setReversalPayment(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyReversal()}
                disabled={!reversalPreview || !reversalReason.trim() || reversalApplying}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reversalApplying ? "Updating..." : reversalKind === "bounce" ? "Mark bounced" : "Reverse payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SOA History Tab Component
 * ═══════════════════════════════════════════════════════ */
function SOAHistoryTab({ customerId, token, locationId }: { customerId: string; token: string; locationId: string }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<CustomerSOAPrintMode>("detailed");
  const [pendingAction, setPendingAction] = useState<SoaHistoryPendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();

  const fetchRecords = useCallback(() => {
    setLoading(true);
    apiFetch<{ data: any[] }>(`/customers/${customerId}/soa/history`, { token, locationId })
      .then((res) => setRecords(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId, token, locationId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleStatusChange = async (soaId: string, status: string, paidAmount?: string) => {
    try {
      const body: any = { status };
      if (paidAmount !== undefined) body.paidAmount = paidAmount;
      await apiFetch(`/customers/${customerId}/soa/${soaId}`, {
        method: "PATCH", body: JSON.stringify(body), token, locationId,
      });
      fetchRecords();
    } catch {}
  };

  const handleUndoPaid = async (r: any) => {
    try {
      // 1. Revert SOA to GENERATED with paidAmount 0
      await apiFetch(`/customers/${customerId}/soa/${r.id}`, {
        method: "PATCH", body: JSON.stringify({ status: "GENERATED", paidAmount: "0" }), token, locationId,
      });
      // 2. Find and delete payment transaction linked to this SOA (search by notes containing SOA number)
      const txRes = await apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions?type=PAYMENT&limit=100`, { token, locationId });
      const linkedPayment = (txRes.data || []).find((t: any) => t.notes && t.notes.includes(`[SOA: ${r.soaNumber}]`));
      if (linkedPayment) {
        try {
          await apiFetch(`/customers/${customerId}/transactions/${linkedPayment.id}`, {
            method: "DELETE", token, locationId,
            body: JSON.stringify({ reason: `Undo paid: reverted ${r.soaNumber}` }),
          });
        } catch {} // Payment may already be deleted or not match
      }
      fetchRecords();
      queryClient.invalidateQueries({ queryKey: ["customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers", customerId, "transactions"] });
    } catch {}
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    setActionError("");
    try {
      if (pendingAction.kind === "void") {
        await handleStatusChange(pendingAction.record.id, "VOID");
      } else if (pendingAction.kind === "undo-sent") {
        await handleStatusChange(pendingAction.record.id, "GENERATED");
      } else {
        await handleUndoPaid(pendingAction.record);
      }
      setPendingAction(null);
      setOpenMenuId(null);
    } catch (err: any) {
      setActionError(err?.message || "Failed to update SOA status");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading SOA history...</div>;

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText size={28} className="text-muted-foreground/30" />
        <p className="mt-3 text-[13px] font-medium text-foreground">No statements generated yet</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Use the Customer SOA workspace to preview, select, generate, and print billing statements.</p>
      </div>
    );
  }

  const STATUS_COLORS: Record<string, string> = {
    GENERATED: "bg-blue-100 text-blue-700",
    SENT: "bg-amber-100 text-amber-700",
    PARTIAL: "bg-orange-100 text-orange-700",
    PAID: "bg-emerald-100 text-emerald-700",
    PARTIALLY_PAID: "bg-orange-100 text-orange-700",
    VOID: "bg-red-100 text-red-700",
  };

  const handleReprint = async (r: any) => {
    try {
      // Historical reprint — use the SOA's stored line items (soa_line_items),
      // NOT a date-range re-query of the customer ledger. Fixes the Lucky
      // Se7en bug where two overlapping-date SOAs both pulled in the same
      // ledger slice on reprint.
      const soaRes = await apiFetch<any>(`/customers/reports/soa-by-id/${r.id}`, { token, locationId });
      const html = printMode === "concise"
        ? buildConciseCustomerSOAHtml({
            customer: soaRes.customer as Customer,
            transactions: soaRes.transactions || [],
            from: r.dateFrom,
            to: r.dateTo,
            soaNumber: r.soaNumber,
          })
        : buildSOAHtml({ customer: soaRes.customer, transactions: soaRes.transactions, openingBalance: soaRes.openingBalance, closingBalance: soaRes.closingBalance, from: r.dateFrom, to: r.dateTo, soaNumber: r.soaNumber });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    } catch {}
  };

  const handlePrintRemaining = async (r: any) => {
    try {
      // Fetch invoices with allocation status
      const invRes = await apiFetch<{ data: any[] }>(`/customers/${customerId}/soa/${r.id}/invoices`, { token, locationId });
      const invoices = invRes.data || [];

      // Get unpaid/partial invoices + credit notes
      const unpaidInvoices = invoices
        .filter((inv: any) => (inv.type === "CHARGE" && inv.paymentStatus !== "PAID") || inv.type === "CREDIT_NOTE")
        .map((inv: any) => ({
          referenceNumber: inv.referenceNumber || "N/A",
          date: inv.recordedAt,
          originalAmount: inv.amount,
          paidAmount: inv.allocatedAmount || 0,
          remainingAmount: inv.remainingAmount || 0,
          type: inv.type,
        }));

      // Get payments allocated to this SOA's invoices
      const paidInvoiceIds = invoices.filter((inv: any) => inv.allocatedAmount > 0).map((inv: any) => inv.id);
      const paymentsReceived: Array<{ referenceNumber: string; date: string; amount: number }> = [];
      // Fetch payment details for allocated invoices
      for (const invId of paidInvoiceIds.slice(0, 20)) {
        try {
          const txRes = await apiFetch<{ data: any[] }>(`/customers/${customerId}/transactions?type=PAYMENT&limit=50`, { token, locationId });
          for (const t of (txRes.data || [])) {
            if (!paymentsReceived.find((p) => p.referenceNumber === t.paymentNumber) && (t.notes || "").includes(r.soaNumber)) {
              paymentsReceived.push({ referenceNumber: t.paymentNumber || "N/A", date: t.recordedAt, amount: Math.abs(parseFloat(t.amount)) });
            }
          }
          break; // Only need to fetch once
        } catch {}
      }

      const totalPayments = paymentsReceived.reduce((s, p) => s + p.amount, 0);
      const period = `${new Date(r.dateFrom).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} \u2013 ${new Date(r.dateTo).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;

      // Find customer name from parent component context
      const custRes = await apiFetch<any>(`/customers/${customerId}`, { token, locationId });
      const custName = custRes?.customer?.name || customerId;
      const custCode = custRes?.customer?.phone || "";

      const html = buildSOARemainingHtml({
        customerName: custName,
        customerCode: custCode,
        soaNumber: r.soaNumber,
        period,
        unpaidInvoices,
        paymentsReceived,
        originalTotal: r.totalPayable || 0,
        totalPayments,
        remainingBalance: (r.totalPayable || 0) - totalPayments,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    } catch {}
  };

  const handlePrintCollectionSummary = async (r: any) => {
    try {
      const payRes = await apiFetch<{ data: any[] }>(`/customers/${customerId}/soa/${r.id}/payment-summary`, { token, locationId });
      const rawPayments = payRes.data || [];

      // Build payment objects with line details
      const payments: CollectionPayment[] = rawPayments.map((p: any) => {
        const lines: Array<{ method: string; amount: number; detail?: string }> = [];
        if (p.paymentLines && Array.isArray(p.paymentLines)) {
          for (const l of p.paymentLines) {
            let detail = "";
            if (l.method === "CHECK") {
              const parts: string[] = [];
              if (l.bank) parts.push(l.bank);
              if (l.checkNumber) parts.push(`#${l.checkNumber}`);
              if (l.checkDate) parts.push(new Date(l.checkDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
              detail = parts.join(", ");
            } else if (l.method === "CREDIT_CARD") {
              const parts: string[] = [];
              if (l.cardType) parts.push(l.cardType);
              if (l.batchNumber) parts.push(`Batch: ${l.batchNumber}`);
              detail = parts.join(", ");
            } else if (l.method === "EWT" && l.rate) {
              detail = `${l.rate}%`;
            }
            lines.push({ method: l.method, amount: parseFloat(l.amount) || 0, detail: detail || undefined });
          }
        } else {
          lines.push({ method: p.paymentMethod || "CASH", amount: p.allocatedToSOA || p.totalAmount });
        }
        return { paymentNumber: p.paymentNumber || "N/A", date: p.recordedAt, lines, totalAmount: p.allocatedToSOA || p.totalAmount };
      });

      const totalCollected = payments.reduce((s, p) => s + p.totalAmount, 0);
      const period = `${new Date(r.dateFrom).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} \u2013 ${new Date(r.dateTo).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;

      const custRes = await apiFetch<any>(`/customers/${customerId}`, { token, locationId });

      const html = buildCollectionSummaryHtml({
        customerName: custRes?.customer?.name || customerId,
        customerCode: custRes?.customer?.phone || "",
        soaNumber: r.soaNumber,
        period,
        soaTotal: r.totalPayable || 0,
        payments,
        soaBalance: (r.totalPayable || 0) - totalCollected,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    } catch {}
  };

  return (
    <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
      <div>
        <div className="text-[12px] font-semibold text-foreground">SOA History</div>
        <div className="text-[11px] text-muted-foreground">Reprints use the selected statement layout.</div>
      </div>
      <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
        {(["detailed", "concise"] as CustomerSOAPrintMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPrintMode(mode)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize",
              printMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>

    <div className="overflow-visible rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground rounded-t-xl">
        <div className="w-32">SOA #</div>
        <div className="w-44">Period</div>
        <div className="w-24 text-right">Payable</div>
        <div className="w-20 text-right">Paid</div>
        <div className="w-20 text-center">Status</div>
        <div className="flex-1">Generated</div>
        <div className="w-24 text-right">Actions</div>
      </div>
      <div className="divide-y divide-border">
        {records.map((r, rIdx) => (
          <div key={r.id} className="flex items-center px-4 py-1.5 text-[13px] hover:bg-accent/30">
            <div className="w-32 font-mono text-[12px] font-semibold text-primary truncate">{r.soaNumber}</div>
            <div className="w-44 text-[12px] text-muted-foreground truncate">
              {new Date(r.dateFrom).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} &ndash;{" "}
              {new Date(r.dateTo).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="w-24 text-right tabular-nums font-semibold text-[12px]">{formatPeso(r.totalPayable)}</div>
            <div className="w-20 text-right tabular-nums text-[12px]">
              {(r.paidAmount || 0) > 0 ? <span className="text-emerald-600">{formatPeso(r.paidAmount)}</span> : "\u2014"}
              {(r.totalPayable || 0) > 0 && (
                <div className="text-[9px] text-muted-foreground">Bal {formatPeso(Math.max(0, moneyValue(r.totalPayable) - moneyValue(r.paidAmount)))}</div>
              )}
            </div>
            <div className="w-20 text-center">
              <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase", STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground")}>{r.status}</span>
            </div>
            <div className="flex-1 text-[11px] text-muted-foreground truncate">
              {new Date(r.generatedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}{" "}
              {new Date(r.generatedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}
              {(r.lineCount || r.linesCount || r.itemCount) && (
                <span className="ml-2 rounded bg-muted px-1 py-px font-semibold">{r.lineCount || r.linesCount || r.itemCount} lines</span>
              )}
              {(r.paymentNumber || r.paymentNumbers?.length) && (
                <span className="ml-2 rounded bg-emerald-100 px-1 py-px font-semibold text-emerald-700">
                  {r.paymentNumber || r.paymentNumbers.join(", ")}
                </span>
              )}
            </div>
            <div className="w-24 flex items-center justify-end gap-1 relative">
              <button onClick={() => handleReprint(r)} className="h-7 rounded px-2 text-[10px] font-medium text-primary hover:bg-primary/10">Print</button>
              {r.status !== "VOID" && (
                <div className="relative">
                  <button onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                    className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground">{"\u22EF"}</button>
                  {openMenuId === r.id && (
                    <div className={`absolute right-0 ${rIdx >= records.length - 2 ? "bottom-full mb-1" : "top-8"} z-20 min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg`}>
                      <button onClick={() => { handlePrintRemaining(r); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent">Print Remaining</button>
                      {(r.status === "PAID" || r.status === "PARTIAL" || (r.paidAmount && parseFloat(r.paidAmount) > 0)) && (
                        <button onClick={() => { handlePrintCollectionSummary(r); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent">Print Collection Summary</button>
                      )}
                      <hr className="my-1 border-border/50" />
                      {/* GENERATED: Mark Sent, Void. To mark an SOA paid, record a
                          payment through the Pay button — status is derived from real
                          ar_payment_allocations, never set manually. */}
                      {r.status === "GENERATED" && (
                        <>
                          <button onClick={() => { handleStatusChange(r.id, "SENT"); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent">Mark Sent</button>
                          <button onClick={() => { setPendingAction({ kind: "void", record: r }); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] text-red-600 hover:bg-accent">Void</button>
                        </>
                      )}
                      {/* SENT: Undo Sent, Void */}
                      {r.status === "SENT" && (
                        <>
                          <button onClick={() => { setPendingAction({ kind: "undo-sent", record: r }); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent">Undo Sent</button>
                          <button onClick={() => { setPendingAction({ kind: "void", record: r }); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] text-red-600 hover:bg-accent">Void</button>
                        </>
                      )}
                      {/* PAID: Undo Paid */}
                      {r.status === "PAID" && (
                        <button onClick={() => { setPendingAction({ kind: "undo-paid", record: r }); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent">Undo Paid</button>
                      )}
                      {/* PARTIAL: Undo Paid, Void */}
                      {(r.status === "PARTIAL" || r.status === "PARTIALLY_PAID") && (
                        <>
                          <button onClick={() => { setPendingAction({ kind: "undo-paid", record: r }); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent">Undo Paid</button>
                          <button onClick={() => { setPendingAction({ kind: "void", record: r }); setOpenMenuId(null); }} className="w-full px-3 py-1.5 text-left text-[11px] text-red-600 hover:bg-accent">Void</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    {pendingAction && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => !actionLoading && setPendingAction(null)}>
        <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {pendingAction.kind === "void" ? "Void SOA" : pendingAction.kind === "undo-sent" ? "Undo sent status" : "Undo paid status"}
              </h3>
              <p className="mt-1 text-[12px] text-muted-foreground">Review what will happen before changing this statement.</p>
            </div>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setPendingAction(null)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-[13px]">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">SOA #</span><span className="font-mono font-semibold">{pendingAction.record.soaNumber}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Current status</span><span className="font-semibold">{pendingAction.record.status}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Payable</span><span className="font-semibold tabular-nums">{formatPeso(pendingAction.record.totalPayable || 0)}</span></div>
            {(pendingAction.record.paidAmount || 0) > 0 && (
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Paid amount</span><span className="font-semibold tabular-nums text-emerald-700">{formatPeso(pendingAction.record.paidAmount || 0)}</span></div>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {pendingAction.kind === "void" && "This will mark the SOA as VOID. It does not delete the customer ledger rows."}
            {pendingAction.kind === "undo-sent" && "This will move the SOA back to GENERATED so it is no longer marked as sent."}
            {pendingAction.kind === "undo-paid" && "This will revert the SOA to generated, reset paid amount, and attempt to delete the linked payment transaction."}
          </div>
          {actionError && <p className="mt-2 text-[12px] text-red-600">{actionError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setPendingAction(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={confirmPendingAction}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50",
                pendingAction.kind === "void" ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90",
              )}
            >
              {actionLoading ? "Updating..." : pendingAction.kind === "void" ? "Void SOA" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
