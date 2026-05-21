export type MonthlyCompareMode = "none" | "mom" | "yoy" | "both";

export interface MonthlyPeriod {
  month: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  weekdays: number;
  sundays: number;
}

export interface MonthlyAggregates {
  period: MonthlyPeriod;
  ap: {
    total: number;
    old: number;
    new: number;
    onAccount: number;
    oldRatio: number | null;
    newRatio: number | null;
    pctOfTotal: number;
  };
  ac: { total: number; cash: number; onAccount: number; pctOfTotal: number };
  service: { total: number; cash: number; onAccount: number; pctOfTotal: number };
  painting: { total: number; cash: number; onAccount: number; pctOfTotal: number };
  junior: { total: number; cash: number; pctOfTotal: number };
  totals: { cash: number; onAccount: number; grandTotal: number; payments: number };
  averages: { weekday: number; sunday: number; daily: number };
  hasData: boolean;
}

export interface MonthlySalesResponse extends MonthlyAggregates {
  comparisons?: {
    mom?: MonthlyAggregates;
    yoy?: MonthlyAggregates;
  };
}

export type DeltaResult =
  | { kind: "pct"; delta: number; pct: number }
  | { kind: "new" }
  | null;

export interface DivisionStyle {
  bar: string;
  barSoft: string;
  text: string;
  headerBg: string;
}
