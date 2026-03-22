import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface ForecastDay {
  date: string;
  inflows: { arCollections: number; projectedSales: number; total: number };
  outflows: { pdcs: number; apInvoices: number; recurring: number; total: number };
  netFlow: number;
  runningNet: number;
  alerts: string[];
}

export interface WeeklyBucket {
  week: string;
  inflows: number;
  outflows: number;
  net: number;
}

export interface ForecastResponse {
  startDate: string;
  days: number;
  avgDailyRevenue: number;
  forecast: ForecastDay[];
  summary: {
    totalInflows: number;
    totalOutflows: number;
    netFlow: number;
    lowestPoint: { date: string; amount: number } | null;
    dangerDays: number;
    pdcTotal: number;
    arCollectible: number;
    recurringMonthly: number;
  };
  weeklyBuckets: WeeklyBucket[];
  monthlyBuckets: { month: string; inflows: number; outflows: number; net: number }[];
}

export interface RecurringExpense {
  id: string;
  name: string;
  category: string;
  amount: string;
  dueDay: number;
  locationId: string | null;
  isActive: boolean;
  notes: string | null;
}

export function useCashFlowForecast(token: string | null, locationId: string | null, days: number = 90) {
  return useQuery({
    queryKey: ["cashflow", "forecast", days],
    queryFn: () => apiFetch<ForecastResponse>(`/cashflow/forecast?days=${days}`, { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId,
  });
}

export function useRecurringExpenses(token: string | null, locationId: string | null) {
  return useQuery({
    queryKey: ["cashflow", "expenses"],
    queryFn: () => apiFetch<{ data: RecurringExpense[] }>("/cashflow/expenses", { token: token!, locationId: locationId! }),
    enabled: !!token && !!locationId,
  });
}

export function useCreateExpense(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => apiFetch("/cashflow/expenses", { token: token!, locationId: locationId!, method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}

export function useUpdateExpense(token: string | null, locationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: any) => apiFetch(`/cashflow/expenses/${id}`, { token: token!, locationId: locationId!, method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}
