export function fmtPeso(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) return `\u20B1${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `\u20B1${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `\u20B1${(v / 1_000).toFixed(1)}K`;
  return `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function fmtPesoFull(v: number): string {
  return `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(v: number | null): string {
  if (v == null) return "\u2014";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const pesoTooltipFormatter: (value: any) => string = (value) =>
  fmtPesoFull(Number(value));

export const pesoTooltipLabelFormatter = (value: any) => fmtDate(String(value));

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
