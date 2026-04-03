"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ReportFilters {
  from?: string;
  to?: string;
  allLocations?: boolean;
}

function buildParams(filters: ReportFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.allLocations) params.set("allLocations", "true");
  return params.toString();
}

export interface SalesByItemRow {
  productId: string;
  productName: string;
  sku: string;
  mnemonicSku: string;
  category: string;
  unitsSold: number;
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  marginPct: string;
  transactionCount: number;
}

export interface SalesByCategoryRow {
  category: string;
  unitsSold: number;
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  marginPct: string;
  uniqueProducts: number;
  transactionCount: number;
}

export interface SalesByEmployeeRow {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  totalSales: number;
  totalRevenue: string;
  totalDiscounts: string;
  avgSaleValue: string;
  maxSaleValue: string;
  refundCount: number;
}

export interface SalesSummary {
  totalTransactions: number;
  totalRevenue: string;
  totalDiscounts: string;
  totalRefunds: number;
  avgTransactionValue: string;
}

export function useSalesByItemQuery(token: string, locationId: string, filters: ReportFilters = {}) {
  const qs = buildParams(filters);
  return useQuery<{ data: SalesByItemRow[] }>({
    queryKey: ["reports", "sales-by-item", filters, locationId],
    queryFn: () => apiFetch<{ data: SalesByItemRow[] }>(`/reports/sales-by-item${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

export function useSalesByCategoryQuery(token: string, locationId: string, filters: ReportFilters = {}) {
  const qs = buildParams(filters);
  return useQuery<{ data: SalesByCategoryRow[] }>({
    queryKey: ["reports", "sales-by-category", filters, locationId],
    queryFn: () => apiFetch<{ data: SalesByCategoryRow[] }>(`/reports/sales-by-category${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

export function useSalesByEmployeeQuery(token: string, locationId: string, filters: ReportFilters = {}) {
  const qs = buildParams(filters);
  return useQuery<{ data: SalesByEmployeeRow[] }>({
    queryKey: ["reports", "sales-by-employee", filters, locationId],
    queryFn: () => apiFetch<{ data: SalesByEmployeeRow[] }>(`/reports/sales-by-employee${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

export function useSalesSummaryQuery(token: string, locationId: string, filters: ReportFilters = {}) {
  const qs = buildParams(filters);
  return useQuery<SalesSummary>({
    queryKey: ["reports", "sales-summary", filters, locationId],
    queryFn: () => apiFetch<SalesSummary>(`/reports/sales-summary${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════
// Dashboard — Daily Sales Summary + KPIs
// ═══════════════════════════════════════════════

export interface DashboardFilters extends ReportFilters {
  employeeId?: string;
}

function buildDashboardParams(filters: DashboardFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.allLocations) params.set("allLocations", "true");
  if (filters.employeeId) params.set("employeeId", filters.employeeId);
  return params.toString();
}

export interface DailySalesRow {
  date: string;
  salesCount: number;
  grossSales: string;
  refunds: string;
  discounts: string;
  netSales: string;
  costOfGoods: string;
  grossProfit: string;
  margin: string;
}

export interface PeriodKPIs {
  grossSales: string;
  refunds: string;
  discounts: string;
  netSales: string;
  costOfGoods: string;
  grossProfit: string;
  margin: string;
  totalTransactions: number;
}

export interface SalesKPIs {
  current: PeriodKPIs;
  prior: PeriodKPIs;
}

export function useDailySalesSummaryQuery(token: string, locationId: string, filters: DashboardFilters = {}) {
  const qs = buildDashboardParams(filters);
  return useQuery<{ data: DailySalesRow[] }>({
    queryKey: ["reports", "daily-sales-summary", filters, locationId],
    queryFn: () => apiFetch<{ data: DailySalesRow[] }>(`/reports/daily-sales-summary${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

export function useSalesKPIsQuery(token: string, locationId: string, filters: DashboardFilters = {}) {
  const qs = buildDashboardParams(filters);
  return useQuery<SalesKPIs>({
    queryKey: ["reports", "sales-kpis", filters, locationId],
    queryFn: () => apiFetch<SalesKPIs>(`/reports/sales-kpis${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════
// Filter Dropdowns — Locations + Employees
// ═══════════════════════════════════════════════

export interface LocationItem {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface EmployeeItem {
  id: string;
  fullName: string;
  role: string;
}

export function useLocationsQuery(token: string) {
  return useQuery<{ data: LocationItem[] }>({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ data: LocationItem[] }>("/locations", { token }),
    enabled: !!token,
    staleTime: 120_000,
  });
}

export function useEmployeesQuery(token: string, locationId: string) {
  return useQuery<{ data: EmployeeItem[] }>({
    queryKey: ["reports", "employees", locationId],
    queryFn: () => apiFetch<{ data: EmployeeItem[] }>("/reports/employees", { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 120_000,
  });
}

// ── Sales by Payment Method ──

export interface PaymentMethodRow {
  method: string;
  transactionCount: number;
  totalAmount: number;
  percentage: number;
}

export interface SalesByPaymentData {
  data: PaymentMethodRow[];
  grandTotal: number;
}

export function useSalesByPaymentQuery(token: string, locationId: string, filters: ReportFilters = {}) {
  const qs = buildParams(filters);
  return useQuery<SalesByPaymentData>({
    queryKey: ["reports", "sales-by-payment", filters, locationId],
    queryFn: () => apiFetch<SalesByPaymentData>(`/reports/sales-by-payment${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

// ── Discount Analysis ──

export interface DiscountAnalysis {
  summary: {
    totalSales: number;
    salesWithDiscount: number;
    totalDiscount: number;
    totalRevenue: number;
    avgDiscountPct: number;
  };
  byEmployee: { userId: string; employeeName: string; transactionCount: number; totalDiscount: number }[];
  byProduct: { productId: string; productName: string; sku: string; transactionCount: number; totalQty: number; totalDiscount: number }[];
  byCategory: { categoryName: string; transactionCount: number; totalQty: number; totalDiscount: number }[];
}

export function useDiscountAnalysisQuery(token: string, locationId: string, filters: ReportFilters = {}) {
  const qs = buildParams(filters);
  return useQuery<DiscountAnalysis>({
    queryKey: ["reports", "discount-analysis", filters, locationId],
    queryFn: () => apiFetch<DiscountAnalysis>(`/reports/discount-analysis${qs ? `?${qs}` : ""}`, { token, locationId }),
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}
