"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface Customer {
  id: string;
  orgId: string;
  name: string;
  customerType: "INDIVIDUAL" | "SHOP" | "FLEET" | "WHOLESALE";
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  tin: string | null;
  creditLimit: string;
  paymentTermsDays: number;
  currentBalance: string;
  totalPurchases: string;
  notes: string | null;
  isActive: boolean;
  txnCount: number;
  unbilledCount: number;
  totalChargeCount: number;
  lastPaymentDate: string | null;
  isOverdue: boolean;
  tierId: string | null;
  tierName: string | null;
  tierColor: string | null;
  tierDiscount: string | null;
  createdAt: string;
  updatedAt: string;
  matchedRef?: string | null; // JSON string with {type, number, date, amount, txnType} when found via invoice/payment search
  agingBuckets?: CustomerAgingBuckets;
  safetySummary?: CustomerSafetySummary;
  creditControl?: CustomerCreditControlSummary;
  collectionSummary?: CustomerCollectionSummary;
  invoiceWarningCounts?: CustomerInvoiceWarningCounts;
  documentCounts?: CustomerDocumentCounts;
  disputeSummary?: CustomerDisputeSummary;
  paymentRiskSummary?: CustomerPaymentRiskSummary;
}

export interface CustomerAgingBucket {
  amount: number;
  count: number;
}

export interface CustomerAgingBuckets {
  current: CustomerAgingBucket;
  days1to30: CustomerAgingBucket;
  days31to60: CustomerAgingBucket;
  days61to90: CustomerAgingBucket;
  days90plus: CustomerAgingBucket;
}

export interface CustomerSafetySummary {
  completenessScore: number;
  missingFields: string[];
  duplicateWarnings: Array<{
    field: string;
    severity: "critical" | "warning";
    message: string;
  }>;
  creditLimitStatus: "ok" | "missing" | "over_limit";
  riskBadges: string[];
}

export interface CustomerCreditControlSummary {
  status: string;
  holdType: "NONE" | "WATCHLIST" | "BLOCK_BILLING" | string;
  reason: string | null;
  note: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  blocksBilling: boolean;
  overLimit: boolean;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number | null;
}

export interface CustomerCollectionSummary {
  openNoteCount: number;
  dueFollowUpCount: number;
  nextFollowUpAt: string | null;
  promiseToPayDate: string | null;
  promisedAmount?: number;
  lastContactAt: string | null;
}

export interface CustomerInvoiceWarningCounts {
  duplicateReferences: number;
  missingReference: number;
  amountAnomalies: number;
  oldUnpaid: number;
  partialPayments: number;
  unbilled: number;
}

export interface CustomerDocumentCounts {
  soaRecords: number;
  payments: number;
  creditMemos: number;
}

export interface CustomerDisputeSummary {
  openCount: number;
  openAmount: number;
}

export interface CustomerPaymentRiskSummary {
  openCount: number;
  bouncedCount: number;
  lastRiskAt: string | null;
}

export interface CustomerTransaction {
  id: string;
  orgId: string;
  customerId: string;
  type: "CHARGE" | "PAYMENT" | "CREDIT_NOTE" | "ADJUSTMENT";
  amount: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  paymentMethod: string | null;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
  dueDate?: string | null;
  billed: boolean | null;
  billedSoaId: string | null;
  paymentNumber: string | null;
  batchNumber: string | null;
  traceNumber: string | null;
  cardType: string | null;
  paymentLines: any[] | null;
  allocatedAmount?: string;
  paymentStatus?: "PAID" | "PARTIAL" | "UNPAID" | null;
}

export interface CustomerDetail {
  customer: Customer;
  recentTransactions: CustomerTransaction[];
}

export interface CustomerListResponse {
  data: Customer[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TransactionListResponse {
  data: CustomerTransaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AgingRow {
  customer: { id: string; name: string };
  customerType: string;
  paymentTerms: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface AgingReportResponse {
  asOfDate: string;
  data: AgingRow[];
  totals: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    total: number;
  };
  percentages: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
  };
}

export interface SOAResponse {
  customer: Customer;
  openingBalance: number;
  transactions: CustomerTransaction[];
  closingBalance: number;
  from: string;
  to: string;
}

export interface ARSummary {
  totalReceivables: number;
  customerCount: number;
  overdueCount: number;
  overdueAmount: number;
  currentCount: number;
  currentAmount: number;
}

export interface CustomerCollectionNote {
  id: string;
  noteType: string;
  contactMethod: string | null;
  outcome: string | null;
  priority: string;
  note: string;
  promisedAmount: number | null;
  promiseToPayDate: string | null;
  followUpAt: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CustomerTimelineEvent {
  id: string;
  source: "transaction" | "soa" | "collection_note" | "audit" | "dispute" | "payment_risk";
  eventType: string;
  title: string;
  occurredAt: string;
  amount: number | null;
  reference: string | null;
  details: Record<string, unknown>;
}

export interface CustomerDocumentRow {
  id: string;
  documentType: "SOA" | "PAYMENT_RECEIPT" | "CREDIT_MEMO" | "COLLECTION_SUMMARY" | "DISPUTE";
  title: string;
  number: string | null;
  status: string | null;
  amount: number;
  date: string | null;
  metadata: Record<string, unknown>;
}

export type CustomerSOAPrintMode = "detailed" | "concise";

export type CustomerCollectionsQueueRow = Customer;

export interface CustomerPaymentAllocationDetail {
  chargeTransactionId: string;
  referenceNumber: string;
  amount: number;
  chargeAmount?: number;
  chargeDate?: string | null;
  soaId?: string | null;
  soaNumber?: string | null;
  remainingAfterAllocation?: number;
}

export interface CustomerPaymentReversalPreview {
  mode: "preview" | "apply";
  canApply: boolean;
  payment: {
    id: string;
    paymentNumber: string | null;
    referenceNumber: string | null;
    amount: number;
    paymentMethod: string | null;
    paymentLines: unknown;
    recordedAt: string | null;
    notes: string | null;
  };
  customer: {
    id: string;
    name: string;
    oldBalance: number;
    newBalance: number;
  };
  allocations: CustomerPaymentAllocationDetail[];
  affectedSoas: Array<{
    id: string;
    soaNumber: string;
    status: string | null;
    totalPayable: number;
    paidAmount: number;
  }>;
  warnings: string[];
  applied?: {
    reversed: boolean;
    newBalance: number;
    recomputedSoas: unknown[];
  };
}

export interface CustomerCreditMemoBucket {
  bucket: "available" | "applied_to_soa" | "used_settled";
  count: number;
  amount: number;
}

export interface CustomerInvoiceWarning {
  code:
    | "duplicate_reference"
    | "missing_reference"
    | "amount_anomaly"
    | "old_unpaid"
    | "partial_payment"
    | "unbilled";
  label: string;
  severity: "critical" | "warning" | "info";
}

export interface CustomerDispute {
  id: string;
  transactionId: string | null;
  soaId: string | null;
  soaNumber: string | null;
  referenceNumber: string | null;
  status: string;
  reason: string;
  disputedAmount: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
  notes: string | null;
  createdByName: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
}

export interface CustomerMergePreview {
  canApply: boolean;
  survivor: Record<string, unknown>;
  duplicate: Record<string, unknown>;
  affectedCounts: Record<string, number>;
  profileConflicts: Array<{ field: string; survivorValue: unknown; duplicateValue: unknown }>;
  warnings: string[];
  applied?: boolean;
}

export interface CustomerCollectionsReport {
  totals: {
    totalOpen: number;
    overdue: number;
    days90Plus: number;
    customersWithBalance: number;
    followUpDue: number;
    promisesMissed: number;
    promisesOpen: number;
    paymentRiskOpen: number;
    bouncedPayments: number;
  };
  topOverdue: Array<{ id: string; name: string; balance: number; creditLimit: number }>;
}

/* ------------------------------------------------------------------ */
/*  Filters                                                           */
/* ------------------------------------------------------------------ */

export interface CustomerListFilters {
  search?: string;
  type?: string;
  hasBalance?: boolean;
  sortBy?: string;
  cursor?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface TransactionFilters {
  type?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                             */
/* ------------------------------------------------------------------ */

export function useCustomerList(
  token: string,
  locationId: string,
  filters: CustomerListFilters = {},
) {
  return useQuery<CustomerListResponse>({
    queryKey: ["customers", "list", filters, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.type) params.set("type", filters.type);
      if (filters.hasBalance !== undefined)
        params.set("hasBalance", String(filters.hasBalance));
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.cursor) params.set("cursor", filters.cursor);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      params.set("limit", String(filters.limit || 50));
      const qs = params.toString();

      return apiFetch<CustomerListResponse>(
        `/customers${qs ? `?${qs}` : ""}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId,
    staleTime: 15_000,
  });
}

export function useCustomer(
  token: string,
  locationId: string,
  customerId: string | undefined,
) {
  return useQuery<CustomerDetail>({
    queryKey: ["customers", customerId],
    queryFn: () =>
      apiFetch<CustomerDetail>(`/customers/${customerId}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId && !!customerId,
    staleTime: 15_000,
  });
}

export function useCustomerTransactions(
  token: string,
  locationId: string,
  customerId: string | undefined,
  filters: TransactionFilters = {},
) {
  return useQuery<TransactionListResponse>({
    queryKey: ["customers", customerId, "transactions", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.type) params.set("type", filters.type);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.cursor) params.set("cursor", filters.cursor);
      if (filters.limit) params.set("limit", String(filters.limit));
      const qs = params.toString();

      return apiFetch<TransactionListResponse>(
        `/customers/${customerId}/transactions${qs ? `?${qs}` : ""}`,
        { token, locationId },
      );
    },
    enabled: !!token && !!locationId && !!customerId,
    staleTime: 15_000,
  });
}

export function useAgingReport(token: string, locationId: string, asOfDate?: string) {
  const params = asOfDate ? `?asOfDate=${asOfDate}` : "";
  return useQuery<AgingReportResponse>({
    queryKey: ["customers", "aging", asOfDate ?? "today"],
    queryFn: () =>
      apiFetch<AgingReportResponse>(`/customers/reports/aging${params}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}

export function useSOA(
  token: string,
  locationId: string,
  customerId: string | undefined,
  from: string,
  to: string,
) {
  return useQuery<SOAResponse>({
    queryKey: ["customers", "soa", customerId, from, to],
    queryFn: () =>
      apiFetch<SOAResponse>(
        `/customers/reports/soa/${customerId}?from=${from}&to=${to}`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!customerId,
    staleTime: 60_000,
  });
}

export function useARSummary(token: string, locationId: string) {
  return useQuery<ARSummary>({
    queryKey: ["customers", "summary"],
    queryFn: () =>
      apiFetch<ARSummary>("/customers/reports/summary", {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}

export function useCustomerCollectionNotes(
  token: string,
  locationId: string,
  customerId: string | undefined,
) {
  return useQuery<{ data: CustomerCollectionNote[] }>({
    queryKey: ["customers", customerId, "collection-notes"],
    queryFn: () =>
      apiFetch<{ data: CustomerCollectionNote[] }>(
        `/customers/${customerId}/collection-notes`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!customerId,
    staleTime: 15_000,
  });
}

export function useCustomerTimeline(
  token: string,
  locationId: string,
  customerId: string | undefined,
) {
  return useQuery<{ data: CustomerTimelineEvent[] }>({
    queryKey: ["customers", customerId, "timeline"],
    queryFn: () =>
      apiFetch<{ data: CustomerTimelineEvent[] }>(
        `/customers/${customerId}/timeline`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!customerId,
    staleTime: 15_000,
  });
}

export function useCustomerDocuments(
  token: string,
  locationId: string,
  customerId: string | undefined,
) {
  return useQuery<{ data: CustomerDocumentRow[] }>({
    queryKey: ["customers", customerId, "documents"],
    queryFn: () =>
      apiFetch<{ data: CustomerDocumentRow[] }>(
        `/customers/${customerId}/documents`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!customerId,
    staleTime: 15_000,
  });
}

export function useCustomerDisputes(
  token: string,
  locationId: string,
  customerId: string | undefined,
) {
  return useQuery<{ data: CustomerDispute[] }>({
    queryKey: ["customers", customerId, "disputes"],
    queryFn: () =>
      apiFetch<{ data: CustomerDispute[] }>(
        `/customers/${customerId}/disputes`,
        { token, locationId },
      ),
    enabled: !!token && !!locationId && !!customerId,
    staleTime: 15_000,
  });
}

export function useCustomerCollectionsReport(token: string, locationId: string) {
  return useQuery<CustomerCollectionsReport>({
    queryKey: ["customers", "collections-report"],
    queryFn: () =>
      apiFetch<CustomerCollectionsReport>("/customers/reports/collections", {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}
