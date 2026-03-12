/**
 * Shared formatting utilities for the Apex POS web dashboard.
 * All monetary values use PHP (₱) and en-PH locale.
 */

export function fmtPeso(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "\u2014";
  return `\u20B1${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-PH");
}

export function fmtPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}
