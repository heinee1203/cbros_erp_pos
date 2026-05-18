import type { DiscountPreset } from "./types";

export const DATE_PRESETS: { key: DiscountPreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "month", label: "Month" },
];

export function fmt(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getDatePreset(preset: DiscountPreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;

  switch (preset) {
    case "today":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      from = new Date(now);
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from = new Date(now);
      from.setMonth(from.getMonth() - 1);
      break;
    case "30d":
      from = new Date(now);
      from.setDate(from.getDate() - 30);
      break;
  }

  return { from: from.toISOString(), to };
}
