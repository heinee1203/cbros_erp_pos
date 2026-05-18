import type { PaymentMethodRow } from "@/hooks/use-sales-reports";

export type SalesByPaymentController = {
  dateFrom: string;
  dateTo: string;
  activePreset: string | null;
  rows: PaymentMethodRow[];
  grandTotal: number;
  isLoading: boolean;
  applyPreset: (preset: string) => void;
  clearDates: () => void;
  setDateRange: (start: string, end: string) => void;
  exportCsv: () => void;
};
