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
  createdAt: string;
  updatedAt: string;
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
  current: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
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

export function useAgingReport(token: string, locationId: string) {
  return useQuery<AgingRow[]>({
    queryKey: ["customers", "aging"],
    queryFn: () =>
      apiFetch<AgingRow[]>("/customers/reports/aging", {
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
