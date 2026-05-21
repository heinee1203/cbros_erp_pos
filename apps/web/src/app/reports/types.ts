import type { Dispatch, SetStateAction } from "react";
import type {
  DailySalesRow,
  EmployeeItem,
  LocationItem,
  SalesByEmployeeRow,
  SalesByItemRow,
  SalesKPIs,
} from "@/hooks/use-sales-reports";

export type ReportsPreset = "today" | "7d" | "30d" | "month" | "custom" | "";

export type TopItemsSort = "revenue" | "units";

export type ReportsDateRange = {
  from: Date;
  to: Date;
};

export type GrossSalesChartPoint = {
  date: string;
  grossSales: number;
  priorGrossSales?: number;
};

export type DailyTotals = {
  salesCount: number;
  grossSales: number;
  refunds: number;
  discounts: number;
  netSales: number;
  costOfGoods: number;
  grossProfit: number;
};

export type ReportsOverviewController = {
  authLoading: boolean;
  range: ReportsDateRange;
  preset: ReportsPreset;
  customFrom: string;
  customTo: string;
  selectedLocation: string;
  selectedEmployee: string;
  topItemsSort: TopItemsSort;
  currentLocationId: string;
  isDataLoading: boolean;
  itemsLoading: boolean;
  employeesReportLoading: boolean;
  kpis: SalesKPIs | undefined;
  days: DailySalesRow[];
  locations: LocationItem[];
  employees: EmployeeItem[];
  topItems: SalesByItemRow[];
  topEmployees: SalesByEmployeeRow[];
  chartData: GrossSalesChartPoint[];
  totals: DailyTotals;
  totalMargin: string;
  applyPreset: (preset: ReportsPreset) => void;
  navigateRange: (direction: "prev" | "next") => void;
  setCustomRange: (start: string, end: string) => void;
  setSelectedLocation: Dispatch<SetStateAction<string>>;
  setSelectedEmployee: Dispatch<SetStateAction<string>>;
  setTopItemsSort: Dispatch<SetStateAction<TopItemsSort>>;
  tryAllLocations: () => void;
};
