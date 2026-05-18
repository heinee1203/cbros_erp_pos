export interface DeadStockTier {
  label: string;
  targetMarginPct: number;
  daysSinceLastSale: number;
}

const DEAD_STOCK_TIERS = [
  { minDays: 90, maxDays: 180, targetMarginPct: 12, label: "Slow Mover" },
  { minDays: 181, maxDays: 365, targetMarginPct: 3, label: "Clearance" },
  {
    minDays: 366,
    maxDays: null as number | null,
    targetMarginPct: -15,
    label: "Deep Clearance",
  },
];

export function getDeadStockTier(
  daysSinceLastSale: number,
): DeadStockTier | null {
  for (const tier of DEAD_STOCK_TIERS) {
    if (
      daysSinceLastSale >= tier.minDays &&
      (tier.maxDays === null || daysSinceLastSale <= tier.maxDays)
    ) {
      return { ...tier, daysSinceLastSale };
    }
  }
  return null;
}

export function suggestClearancePrice(
  costPrice: number,
  daysSinceLastSale: number,
): number | null {
  const tier = getDeadStockTier(daysSinceLastSale);
  if (!tier) return null;
  return Math.round(costPrice * (1 + tier.targetMarginPct / 100) * 100) / 100;
}
