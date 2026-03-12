"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface JCLocation {
  id: string;
  name: string;
  code: string;
  type: string;
}

export interface JCCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface JCVehicle {
  id: string;
  customerId: string;
  make: string;
  model: string;
  year: number | null;
  plateNo: string | null;
  notes: string | null;
}

export interface JCLaborLine {
  id: string;
  serviceOperationId: string;
  description: string | null;
  qtyHours: string;
  unitPrice: string;
  lineTotal: string;
  createdAt: string;
  opCode: string;
  opName: string;
  opCategory: string;
}

export interface JCPartLine {
  id: string;
  productId: string;
  locationId: string;
  plannedQty: number;
  reservedQty: number;
  issuedQty: number;
  returnedQty: number;
  unitPrice: string;
  createdAt: string;
  productName: string;
  sku: string;
  mnemonicSku: string;
  category: string;
}

export interface JCJournalEntry {
  id: string;
  productId: string;
  locationId: string;
  changeQuantity: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  referenceLineId: string | null;
  idempotencyKey: string;
  notes: string | null;
  createdAt: string;
  effectiveAt: string;
}

export interface JobCardDetail {
  id: string;
  orgId: string;
  jobNo: string;
  customerId: string;
  customerVehicleId: string;
  locationId: string;
  status: string;
  assignedTechnicianUserId: string | null;
  odometerReading: number | null;
  notes: string | null;
  createdByUserId: string;
  checkedInByUserId: string | null;
  approvedByUserId: string | null;
  cancelledByUserId: string | null;
  closedByUserId: string | null;
  checkedInAt: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  invoicedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  customer: JCCustomer;
  vehicle: JCVehicle;
  location: JCLocation;
  laborLines: JCLaborLine[];
  partLines: JCPartLine[];
  allowedActions: string[];
}

export interface ServiceOperation {
  id: string;
  orgId: string;
  code: string;
  name: string;
  category: string;
  defaultLaborRate: string;
  estimatedHours: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Hooks ──

/**
 * Fetch a job card by its public job number.
 */
export function useJobCardQuery(
  jobNo: string,
  token: string,
  locationId: string,
) {
  return useQuery<JobCardDetail>({
    queryKey: ["job-card", jobNo, locationId],
    queryFn: () =>
      apiFetch<JobCardDetail>(
        `/job-cards/by-number/${encodeURIComponent(jobNo)}`,
        { token, locationId },
      ),
    enabled: !!jobNo && !!token && !!locationId,
    staleTime: 10_000,
  });
}

/**
 * Fetch service operations catalog.
 */
export function useServiceOperationsQuery(
  token: string,
  locationId: string,
) {
  return useQuery<{ data: ServiceOperation[]; nextCursor: string | null; hasMore: boolean }>({
    queryKey: ["service-operations"],
    queryFn: () =>
      apiFetch<{ data: ServiceOperation[]; nextCursor: string | null; hasMore: boolean }>(
        "/job-cards/service-operations?limit=100",
        { token, locationId },
      ),
    enabled: !!token && !!locationId,
    staleTime: 60_000,
  });
}

/**
 * Fetch job card journal entries.
 */
export function useJobCardJournalQuery(
  jobCardId: string,
  token: string,
  locationId: string,
) {
  return useQuery<JCJournalEntry[]>({
    queryKey: ["job-card-journal", jobCardId],
    queryFn: () =>
      apiFetch<JCJournalEntry[]>(
        `/job-cards/${jobCardId}/journal`,
        { token, locationId },
      ),
    enabled: !!jobCardId && !!token && !!locationId,
    staleTime: 10_000,
  });
}
