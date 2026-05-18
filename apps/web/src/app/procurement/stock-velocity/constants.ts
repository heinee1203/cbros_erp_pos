import {
  AlertTriangle,
  Package,
  Shield,
  TrendingUp,
  XCircle,
} from "lucide-react";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export const VELOCITY_CLASSES = [
  {
    key: "FAST_MOVER",
    label: "Fast Movers",
    badge: "bg-green-100 text-green-700",
    icon: TrendingUp,
    summaryKey: "fastMovers" as const,
  },
  {
    key: "STRATEGIC_STOCK",
    label: "Strategic",
    badge: "bg-blue-100 text-blue-700",
    icon: Shield,
    summaryKey: "strategicStock" as const,
  },
  {
    key: "WATCH_LIST",
    label: "Watch List",
    badge: "bg-amber-100 text-amber-700",
    icon: AlertTriangle,
    summaryKey: "watchList" as const,
  },
  {
    key: "DEAD_STOCK",
    label: "Dead Stock",
    badge: "bg-red-100 text-red-700",
    icon: XCircle,
    summaryKey: "deadStockVelocity" as const,
  },
  {
    key: "NEW_ITEM",
    label: "New Item",
    badge: "bg-gray-100 text-gray-600",
    icon: Package,
    summaryKey: "newItems" as const,
  },
];

export const DEMAND_TOOLTIP =
  "Average units sold per month over the selected window (30/90/180/365d). Computed from stock_metrics.avg_daily_sales_Xd x 30.";
