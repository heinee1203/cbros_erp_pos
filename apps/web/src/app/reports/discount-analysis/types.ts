import type { DiscountAnalysis } from "@/hooks/use-sales-reports";

export type DiscountAnalysisTab = "employee" | "product" | "category";

export type DiscountPreset = "today" | "week" | "30d" | "month";

export type DiscountAnalysisController = {
  dateFrom: string;
  dateTo: string;
  activePreset: DiscountPreset | null;
  tab: DiscountAnalysisTab;
  data: DiscountAnalysis | undefined;
  summary: DiscountAnalysis["summary"] | undefined;
  isLoading: boolean;
  applyPreset: (preset: DiscountPreset) => void;
  clearDates: () => void;
  setDateRange: (start: string, end: string) => void;
  setTab: (tab: DiscountAnalysisTab) => void;
};
