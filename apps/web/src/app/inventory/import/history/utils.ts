import type { ImportableReasonType, ReasonType } from "./types";

export function isImportableReason(reason: ReasonType): reason is ImportableReasonType {
  return reason !== "Sale" && reason !== "Refund";
}

export function formatImportMonth(value: string | null | undefined) {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
