import { downloadCSV } from "@/lib/csv-export";
import type { CommissionRow } from "@/hooks/use-technicians";
import type { MergedRow, SortDir, SortField, TechRow } from "./types";

export const EMPTY_FORMULA = "\u2014";

export const ROLE_COLORS: Record<string, string> = {
  chief_mechanic: "bg-amber-500/10 text-amber-700",
  installer: "bg-blue-500/10 text-blue-600",
  mechanic: "bg-emerald-500/10 text-emerald-600",
  electrician: "bg-violet-500/10 text-violet-600",
};

export const ROLE_LABELS: Record<string, string> = {
  chief_mechanic: "Chief",
  installer: "Installer",
  mechanic: "Mechanic",
  electrician: "Electrician",
  painter: "Painter",
};

export function fmtCurrency(v: number) {
  return "\u20B1" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNumber(v: number) {
  return v.toLocaleString("en-PH");
}

export function mergeProductivityWithCommissions(rawData: TechRow[], commissions: CommissionRow[]): MergedRow[] {
  const commMap = new Map<string, CommissionRow>();
  commissions.forEach((commission) => commMap.set(commission.technicianId, commission));

  return rawData.map((row) => {
    const commission = row.technicianId ? commMap.get(row.technicianId) : undefined;

    return {
      ...row,
      role: commission?.role ?? null,
      locationId: commission?.locationId ?? null,
      fixedCommission: commission?.fixedCommission ?? 0,
      rateCommission: commission?.rateCommission ?? 0,
      commission: commission?.commission ?? 0,
      formula: commission?.formula ?? EMPTY_FORMULA,
      commissionType: commission?.commissionType ?? "percentage",
    };
  });
}

export function sortMechanicRows(rows: MergedRow[], sortBy: SortField, sortDir: SortDir) {
  return [...rows].sort((a, b) => {
    let first: number | string;
    let second: number | string;

    switch (sortBy) {
      case "technicianName":
        first = a.technicianName.toLowerCase();
        second = b.technicianName.toLowerCase();
        return sortDir === "asc" ? (first < second ? -1 : 1) : (second < first ? -1 : 1);
      case "jobCount":
        first = a.jobCount;
        second = b.jobCount;
        break;
      case "revenue":
        first = a.revenue;
        second = b.revenue;
        break;
      case "avgPerJob":
        first = a.avgPerJob;
        second = b.avgPerJob;
        break;
      case "commission":
        first = a.commission;
        second = b.commission;
        break;
      default:
        first = a.revenue;
        second = b.revenue;
    }

    return sortDir === "desc" ? (second as number) - (first as number) : (first as number) - (second as number);
  });
}

export function exportCommissionReport(rows: MergedRow[]) {
  downloadCSV(
    "commission-report",
    ["Technician", "Role", "Jobs", "Total Revenue", "Fixed Commission", "Rate Commission", "Total Commission", "Formula"],
    rows.map((row) => [
      row.technicianName,
      row.role ?? EMPTY_FORMULA,
      String(row.jobCount),
      row.revenue.toFixed(2),
      row.fixedCommission.toFixed(2),
      row.rateCommission.toFixed(2),
      row.commission.toFixed(2),
      row.formula,
    ]),
  );
}
