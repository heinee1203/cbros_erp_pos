export function fmtCurrency(value: unknown): string {
  const amount = Number(value) || 0;
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(value: unknown): string {
  const amount = Number(value) || 0;
  return `${amount.toFixed(1)}%`;
}

export function getDeadStockTier(daysSinceSale: number): { label: string; color: string; marginPct: number } {
  if (daysSinceSale >= 366) {
    return { label: "Deep Clearance", color: "bg-red-500/20 text-red-400", marginPct: -15 };
  }
  if (daysSinceSale >= 181) {
    return { label: "Clearance", color: "bg-orange-500/20 text-orange-400", marginPct: 3 };
  }
  return { label: "Slow Mover", color: "bg-amber-500/20 text-amber-400", marginPct: 12 };
}

export function calcSuggestedPrice(costPrice: number | unknown, tierMarginPct: number): number {
  const cost = Number(costPrice) || 0;
  return cost * (1 + tierMarginPct / 100);
}
