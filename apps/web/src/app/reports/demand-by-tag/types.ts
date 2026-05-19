import type { Dispatch, SetStateAction } from "react";

export interface DemandRow {
  tagId: string;
  tagName: string;
  tagType: string;
  unitsSold?: number;
  totalQtySold?: number;
  revenue?: number;
  totalRevenue?: number;
  productCount: number;
  topBrand: string | null;
  stockLeft?: number;
  daysOfStock?: number | null;
}

export interface DetailProduct {
  productId: string;
  name: string;
  brand: string | null;
  sku: string;
  unitPrice: string;
  qtySold: number;
  revenue: number;
  stock: number;
  daysLeft: number | null;
}

export interface DetailBrand {
  brand: string;
  qty: number;
  revenue: number;
}

export type TagTypeFilter = "ALL" | "TIRE_SIZE" | "VEHICLE" | "APPLICATION_CODE";

export type SortKey = "tagName" | "unitsSold" | "revenue" | "productCount" | "stockLeft" | "daysOfStock";
export type SortDir = "asc" | "desc";

export type DemandByTagController = {
  token: string;
  locationId: string;
  tagTypeFilter: TagTypeFilter;
  rimSizeFilter: string;
  dateFrom: string;
  dateTo: string;
  activePreset: string | null;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  expandedTagId: string | null;
  rows: DemandRow[];
  rimSizes: string[];
  isLoading: boolean;
  totalApplications: number;
  totalUnits: number;
  mostInDemand: string;
  setRimSizeFilter: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setExpandedTagId: Dispatch<SetStateAction<string | null>>;
  setTagTypeFilterOption: (filter: TagTypeFilter) => void;
  setDateRange: (start: string, end: string) => void;
  applyPreset: (preset: string) => void;
  clearDates: () => void;
  toggleSort: (key: SortKey) => void;
  exportCsv: () => void;
};
