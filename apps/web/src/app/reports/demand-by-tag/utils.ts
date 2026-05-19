import type { LucideIcon } from "lucide-react";
import { Car, FileCode, Hash, Layers } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";
import type { DemandRow, TagTypeFilter } from "./types";

export const TAG_TYPE_TABS: Array<{ key: TagTypeFilter; label: string; icon: LucideIcon }> = [
  { key: "ALL", label: "All", icon: Layers },
  { key: "TIRE_SIZE", label: "Tire Sizes", icon: Hash },
  { key: "VEHICLE", label: "Vehicle Fitment", icon: Car },
  { key: "APPLICATION_CODE", label: "Application Codes", icon: FileCode },
];

export const TAG_TYPE_BADGE: Record<string, string> = {
  TIRE_SIZE: "bg-blue-50 text-blue-700",
  VEHICLE: "bg-green-50 text-green-700",
  APPLICATION_CODE: "bg-purple-50 text-purple-700",
  CUSTOM: "bg-gray-100 text-gray-700",
};

export function fmt(value: number) {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

export function getDatePreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  switch (preset) {
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "180d":
      from.setDate(from.getDate() - 180);
      break;
    case "365d":
      from.setDate(from.getDate() - 365);
      break;
    default:
      from.setDate(from.getDate() - 90);
  }
  return { from: from.toISOString(), to };
}

export function exportDemandByTagCsv(rows: DemandRow[]) {
  downloadCSV(
    "demand-by-application",
    ["Application", "Type", "Units Sold", "Revenue", "Products", "Top Brand", "Stock Left", "Days of Stock"],
    rows.map((row) => [
      row.tagName,
      row.tagType.replace(/_/g, " "),
      String(row.unitsSold ?? row.totalQtySold ?? 0),
      String(row.revenue ?? row.totalRevenue ?? 0),
      String(row.productCount),
      row.topBrand ?? "-",
      String(row.stockLeft ?? 0),
      row.daysOfStock != null ? String(row.daysOfStock) : "-",
    ]),
  );
}
