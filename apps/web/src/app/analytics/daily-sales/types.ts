export type GroupBy = "day" | "week" | "month" | "quarter" | "year";

export interface SummaryResponse {
  from: string;
  to: string;
  dayCount: number;
  totalSales: number;
  cashSales: number;
  creditSales: number;
  totalPayments: number;
  avgDailySales: number;
  cashShare: number | null;
  creditShare: number | null;
  bestDay: { date: string; amount: number } | null;
  worstDay: { date: string; amount: number } | null;
  prevFrom: string;
  prevTo: string;
  prevTotalSales: number;
  yoyGrowthPct: number | null;
}

export interface SeriesBucket {
  bucket: string;
  dayCount: number;
  apOldSales: number;
  apNewSales: number;
  apOnAccount: number;
  acSales: number;
  acOnAccount: number;
  serviceSales: number;
  serviceOnAccount: number;
  paintingSales: number;
  paintingOnAccount: number;
  juniorSales: number;
  payments: number;
  autoParts: number;
  accessories: number;
  service: number;
  painting: number;
  junior: number;
  total: number;
}

export interface DivisionRow {
  key: string;
  label: string;
  cash: number;
  credit: number;
  total: number;
  share: number | null;
}

export interface DivisionResponse {
  from: string;
  to: string;
  divisions: DivisionRow[];
  totalCash: number;
  totalCredit: number;
  grandTotal: number;
}

export interface YoYRow {
  year: number;
  month: number;
  total: number;
}

export interface DayOfWeekRow {
  dow: number;
  dayCount: number;
  total: number;
  avg: number;
}

export interface DailyRow {
  date: string;
  apOldSales: number;
  apNewSales: number;
  apOnAccount: number;
  acSales: number;
  acOnAccount: number;
  serviceSales: number;
  serviceOnAccount: number;
  paintingSales: number;
  paintingOnAccount: number;
  juniorSales: number;
  payments: number;
}

export interface SingleDayResponse {
  date: string;
  dayOfWeek: string;
  hasData: boolean;
  ap: {
    old: number;
    new: number;
    total: number;
    onAccount: number;
    oldRatio: number | null;
    newRatio: number | null;
  };
  ac: { cash: number; onAccount: number; total: number };
  service: { cash: number; onAccount: number; total: number };
  painting: { cash: number; onAccount: number; total: number };
  junior: { cash: number; total: number };
  totals: {
    cash: number;
    onAccount: number;
    grandTotal: number;
    payments: number;
  };
  percentages: {
    ap: number;
    ac: number;
    service: number;
    painting: number;
    junior: number;
  };
}

export interface Preset {
  label: string;
  compute: () => { from: string; to: string };
}
