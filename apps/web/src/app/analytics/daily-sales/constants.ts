import type { Preset } from "./types";
import { toIso } from "./formatters";

export const PRESETS: Preset[] = [
  {
    label: "This Month",
    compute: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIso(first), to: toIso(now) };
    },
  },
  {
    label: "Last Month",
    compute: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIso(first), to: toIso(last) };
    },
  },
  {
    label: "This Quarter",
    compute: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), q * 3, 1);
      return { from: toIso(first), to: toIso(now) };
    },
  },
  {
    label: "Last Quarter",
    compute: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3) - 1;
      const year = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const quarter = (q + 4) % 4;
      const first = new Date(year, quarter * 3, 1);
      const last = new Date(year, (quarter + 1) * 3, 0);
      return { from: toIso(first), to: toIso(last) };
    },
  },
  {
    label: "This Year",
    compute: () => {
      const now = new Date();
      return { from: `${now.getFullYear()}-01-01`, to: toIso(now) };
    },
  },
  {
    label: "Last Year",
    compute: () => {
      const y = new Date().getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  {
    label: "All Time",
    compute: () => ({ from: "2019-06-01", to: toIso(new Date()) }),
  },
];

export const DIVISION_COLORS: Record<string, string> = {
  auto_parts: "#3b82f6",
  accessories: "#10b981",
  service: "#f59e0b",
  painting: "#8b5cf6",
  junior: "#ef4444",
};

export const YOY_COLORS = [
  "#94a3b8",
  "#64748b",
  "#475569",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
];

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
