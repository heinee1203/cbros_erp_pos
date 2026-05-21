import { AlertTriangle, History, TrendingDown, Upload } from "lucide-react";

export const TABS = [
  { id: "bulk", label: "Bulk Update", icon: Upload },
  { id: "margins", label: "Margin Alerts", icon: AlertTriangle },
  { id: "dead-stock", label: "Dead Stock Clearance", icon: TrendingDown },
  { id: "history", label: "Price History", icon: History },
] as const;

export type TabId = (typeof TABS)[number]["id"];
