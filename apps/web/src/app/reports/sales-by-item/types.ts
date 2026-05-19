import type { Dispatch, SetStateAction } from "react";
import type { SalesByItemRow, SalesSummary } from "@/hooks/use-sales-reports";

export type SortField = "unitsSold" | "totalRevenue" | "totalCost" | "grossProfit" | "marginPct";
export type SortDir = "asc" | "desc";

export type SalesByItemController = {
  dateFrom: string;
  dateTo: string;
  search: string;
  categoryFilter: string;
  sortBy: SortField;
  sortDir: SortDir;
  page: number;
  perPage: number;
  categories: string[];
  filtered: SalesByItemRow[];
  paginated: SalesByItemRow[];
  summary: SalesSummary | undefined;
  uniqueItemCount: number;
  totalPages: number;
  isLoading: boolean;
  hasActiveFilters: boolean;
  setDateRange: (start: string, end: string) => void;
  setSearchFilter: (value: string) => void;
  setCategoryFilterValue: (value: string) => void;
  setPage: Dispatch<SetStateAction<number>>;
  setPerPageValue: (value: number) => void;
  resetFilters: () => void;
  handleSort: (field: SortField) => void;
  exportCsv: () => void;
};
