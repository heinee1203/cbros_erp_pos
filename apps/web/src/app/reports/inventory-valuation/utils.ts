import { downloadCSV } from "@/lib/csv-export";
import type { GroupByOption, ValuationGroup } from "@/hooks/use-inventory-valuation";

export const CHART_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#F43F5E", "#94A3B8"];

export const UNASSIGNED_GROUPS = new Set(["No Family", "No Brand", "Uncategorized"]);

export function fmtCurrency(value: number) {
  return "\u20B1" + value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCompact(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}\u20B1${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}\u20B1${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}\u20B1${(abs / 1_000).toFixed(1)}K`;
  return `${sign}\u20B1${abs.toFixed(0)}`;
}

export function fmtNumber(value: number) {
  return value.toLocaleString("en-PH");
}

export function marginColor(percent: number) {
  if (percent >= 30) return "text-emerald-600";
  if (percent >= 15) return "text-amber-600";
  return "text-red-500";
}

export function exportInventoryValuationCsv(groupBy: GroupByOption, groups: ValuationGroup[]) {
  downloadCSV(
    `inventory-valuation-by-${groupBy}`,
    ["#", "Group", "SKUs", "Units", "Cost Value", "Retail Value", "Margin %", "% of Total"],
    groups.map((group, index) => [
      String(index + 1),
      group.groupName,
      String(group.skuCount),
      String(group.totalUnits),
      group.costValue.toFixed(2),
      group.retailValue.toFixed(2),
      `${group.marginPct}%`,
      `${group.pctOfTotal}%`,
    ]),
  );
}
