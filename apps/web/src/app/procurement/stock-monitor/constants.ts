import type { StockMonitorColumn, VelocityWindow } from "./types";

export const STATUS_CONFIG: Record<string, { label: string; badge: string; text: string }> = {
  CRITICAL: { label: "Critical", badge: "bg-red-100 text-red-700", text: "text-red-700" },
  LOW: { label: "Low", badge: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  HEALTHY: { label: "Healthy", badge: "bg-green-100 text-green-700", text: "text-green-700" },
  OVERSTOCK: { label: "Overstock", badge: "bg-blue-100 text-blue-700", text: "text-blue-700" },
  DEAD_STOCK: { label: "Dead Stock", badge: "bg-gray-100 text-gray-600", text: "text-gray-600" },
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export const DEFAULT_VISIBLE_COLS = [
  "status",
  "product",
  "brand",
  "category",
  "totalStock",
  "avgSales",
  "daysOfStock",
  "lastSold",
];

export const ALL_COLUMNS: StockMonitorColumn[] = [
  { key: "status", label: "Status" },
  { key: "product", label: "Product" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "subcategory", label: "Sub-category" },
  { key: "totalStock", label: "Total Stock" },
  { key: "avgSales", label: "Avg Sales/Day" },
  { key: "daysOfStock", label: "Days of Stock" },
  { key: "lastSold", label: "Last Sold" },
  { key: "stockoutDays", label: "Stockout Days" },
  { key: "lastPo", label: "Last PO" },
  { key: "leadTime", label: "Lead Time" },
  { key: "ai", label: "AI" },
];

export const VELOCITY_PILLS: { key: VelocityWindow; label: string }[] = [
  { key: "30", label: "1mo" },
  { key: "90", label: "3mo" },
  { key: "180", label: "6mo" },
  { key: "365", label: "1yr" },
  { key: "all", label: "All" },
];
