import type { Dispatch, SetStateAction } from "react";
import type { Brand } from "@/hooks/use-brands";
import type { CategoryRow } from "@/hooks/use-categories";
import type {
  GroupByOption,
  ValuationGroup,
  ValuationTotals,
} from "@/hooks/use-inventory-valuation";
import type { LocationRow } from "@/hooks/use-locations";

export type SortField = "skuCount" | "totalUnits" | "costValue" | "retailValue" | "marginPct" | "pctOfTotal";
export type SortDir = "asc" | "desc";

export type ValuationChartSlice = {
  name: string;
  value: number;
  pctOfTotal: number;
  fill: string;
};

export type InventoryValuationController = {
  groupBy: GroupByOption;
  filterLocationId: string;
  filterCategoryId: string;
  filterBrandId: string;
  excludeZeroCost: boolean;
  excludeZeroSell: boolean;
  excludeUnassigned: boolean;
  search: string;
  sortBy: SortField;
  sortDir: SortDir;
  expandedGroup: string | null;
  dismissWarning: boolean;
  locations: LocationRow[];
  categories: CategoryRow[];
  brands: Brand[];
  totals: ValuationTotals | undefined;
  filtered: ValuationGroup[];
  chartData: ValuationChartSlice[];
  maxCostValue: number;
  isLoading: boolean;
  hasFilters: boolean;
  setFilterLocationId: Dispatch<SetStateAction<string>>;
  setFilterCategoryId: Dispatch<SetStateAction<string>>;
  setFilterBrandId: Dispatch<SetStateAction<string>>;
  setExcludeZeroCost: Dispatch<SetStateAction<boolean>>;
  setExcludeZeroSell: Dispatch<SetStateAction<boolean>>;
  setExcludeUnassigned: Dispatch<SetStateAction<boolean>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setExpandedGroup: Dispatch<SetStateAction<string | null>>;
  setDismissWarning: Dispatch<SetStateAction<boolean>>;
  setGroupByOption: (option: GroupByOption) => void;
  resetFilters: () => void;
  handleSort: (field: SortField) => void;
  exportCsv: () => void;
};
