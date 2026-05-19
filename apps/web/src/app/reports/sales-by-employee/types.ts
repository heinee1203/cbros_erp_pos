import type { SalesByEmployeeRow, SalesSummary } from "@/hooks/use-sales-reports";

export type SortField = "totalSales" | "totalRevenue" | "avgSaleValue" | "totalDiscounts" | "refundCount";
export type SortDir = "asc" | "desc";

export type SalesByEmployeeController = {
  dateFrom: string;
  dateTo: string;
  search: string;
  sortBy: SortField;
  sortDir: SortDir;
  filtered: SalesByEmployeeRow[];
  summary: SalesSummary | undefined;
  maxRevenue: number;
  totalRev: number;
  totalDisc: number;
  avgPerEmployee: number;
  isLoading: boolean;
  hasFilters: boolean;
  setDateRange: (start: string, end: string) => void;
  setSearch: (value: string) => void;
  resetFilters: () => void;
  handleSort: (field: SortField) => void;
  exportCsv: () => void;
};
