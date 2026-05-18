import type { SupplierMetricsRow } from "@/hooks/use-stock-monitor";
import { cn } from "@/lib/utils";

type SupplierRowProps = {
  row: SupplierMetricsRow;
};

export function SupplierRow({ row }: SupplierRowProps) {
  const reliability = row.reliabilityPct != null ? parseFloat(row.reliabilityPct) : null;
  const avgLead = row.avgLeadTimeDays != null ? parseFloat(row.avgLeadTimeDays) : null;

  let reliabilityColor = "text-muted-foreground";
  if (reliability != null) {
    if (reliability >= 90) reliabilityColor = "text-green-700";
    else if (reliability >= 70) reliabilityColor = "text-amber-700";
    else reliabilityColor = "text-red-700";
  }

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      <td className="max-w-[280px] px-4 py-1.5">
        <div className="truncate text-sm font-medium text-foreground" title={row.supplierName}>
          {row.supplierName}
        </div>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-foreground">
        {row.poCount6m}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm font-medium text-foreground">
        {avgLead != null ? `${avgLead.toFixed(1)}d` : "\u2014"}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.minLeadTimeDays != null ? `${row.minLeadTimeDays}d` : "\u2014"}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.maxLeadTimeDays != null ? `${row.maxLeadTimeDays}d` : "\u2014"}
      </td>

      <td className={cn("whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm font-medium", reliabilityColor)}>
        {reliability != null ? `${reliability.toFixed(1)}%` : "\u2014"}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-sm text-muted-foreground">
        {row.lastPoDate ? new Date(row.lastPoDate).toLocaleDateString() : "\u2014"}
      </td>
    </tr>
  );
}
