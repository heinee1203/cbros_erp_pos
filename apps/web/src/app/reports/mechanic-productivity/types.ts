import type { CommissionResponse } from "@/hooks/use-technicians";

export interface TechRow {
  technicianId: string | null;
  technicianName: string;
  jobCount: number;
  revenue: number;
  avgPerJob: number;
  pctOfTotal: number;
}

export interface MechanicData {
  data: TechRow[];
  summary: {
    totalRevenue: number;
    totalJobs: number;
    avgPerJob: number;
    topTechnician: string;
  };
}

export type SortField = "technicianName" | "jobCount" | "revenue" | "avgPerJob" | "commission";
export type SortDir = "asc" | "desc";

export interface MergedRow {
  technicianId: string | null;
  technicianName: string;
  role: string | null;
  locationId: string | null;
  jobCount: number;
  revenue: number;
  avgPerJob: number;
  pctOfTotal: number;
  fixedCommission: number;
  rateCommission: number;
  commission: number;
  formula: string;
  commissionType: string;
}

export type MechanicProductivityController = {
  dateFrom: string;
  dateTo: string;
  sortBy: SortField;
  sortDir: SortDir;
  showFormula: string | null;
  sorted: MergedRow[];
  merged: MergedRow[];
  locationMap: Map<string, string>;
  summary: MechanicData["summary"] | undefined;
  commSummary: CommissionResponse["summary"] | undefined;
  totalCommission: number;
  maxRevenue: number;
  isLoading: boolean;
  setDateRange: (start: string, end: string) => void;
  handleSort: (field: SortField) => void;
  toggleFormula: (technicianId: string | null) => void;
  exportCsv: () => void;
};
