import type { DivisionStyle } from "./types";

export const MIN_MONTH = "2022-01";

export const DIVISION_STYLES: Record<"ap" | "ac" | "service" | "painting" | "junior", DivisionStyle> = {
  ap: { bar: "#2563eb", barSoft: "#dbeafe", text: "#1e40af", headerBg: "#eff6ff" },
  ac: { bar: "#16a34a", barSoft: "#dcfce7", text: "#15803d", headerBg: "#f0fdf4" },
  service: { bar: "#ea580c", barSoft: "#ffedd5", text: "#c2410c", headerBg: "#fff7ed" },
  painting: { bar: "#7c3aed", barSoft: "#ede9fe", text: "#6d28d9", headerBg: "#f5f3ff" },
  junior: { bar: "#0891b2", barSoft: "#cffafe", text: "#0e7490", headerBg: "#ecfeff" },
};
