import type { SalesSummary } from "@/hooks/use-sales-reports";

export type SortField = "categoryName" | "unitsSold" | "totalRevenue" | "grossProfit" | "marginPct" | "uniqueProducts";
export type SortDir = "asc" | "desc";

export type CategorySalesRow = {
  category: string;
  categoryName?: string;
  unitsSold: number;
  totalRevenue: string;
  grossProfit: string;
  marginPct: string;
  uniqueProducts: number;
};

export type SalesByCategoryController = {
  dateFrom: string;
  dateTo: string;
  search: string;
  sortBy: SortField;
  sortDir: SortDir;
  filtered: CategorySalesRow[];
  summary: SalesSummary | undefined;
  maxRevenue: number;
  totalProfit: number;
  totalRevenue: number;
  avgMargin: number;
  isLoading: boolean;
  hasFilters: boolean;
  setDateRange: (start: string, end: string) => void;
  setSearch: (value: string) => void;
  resetFilters: () => void;
  handleSort: (field: SortField) => void;
  exportCsv: () => void;
};
