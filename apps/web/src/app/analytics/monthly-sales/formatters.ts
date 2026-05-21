import type { DeltaResult } from "./types";

export function fmtPesoFull(v: number): string {
  return `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPesoOrDash(v: number): string {
  return v > 0 ? fmtPesoFull(v) : "\u2014";
}

export function currentMonthLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthToDate(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function fmtMonthLong(ym: string): string {
  return monthToDate(ym).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateLong(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function computeDelta(current: number, prior: number | null | undefined): DeltaResult {
  if (prior == null) return null;
  if (prior === 0) {
    return current > 0 ? { kind: "new" } : null;
  }
  const delta = current - prior;
  return { kind: "pct", delta, pct: (delta / prior) * 100 };
}
