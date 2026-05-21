import type { ReportsDateRange } from "./types";

export function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function fmtRangeLabel(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${from.toLocaleDateString("en-PH", opts)} - ${to.toLocaleDateString("en-PH", opts)}`;
}

export function getDefaultRange(): ReportsDateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { from: addDays(today, -6), to: today };
}
