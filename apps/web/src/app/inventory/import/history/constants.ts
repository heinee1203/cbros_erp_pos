import type { ImportableReasonType, ReasonType } from "./types";

export const ALL_REASONS: ImportableReasonType[] = ["PO Receipt", "Transfer", "Count", "Damage", "Loss"];
export const DEFAULT_CHECKED: ImportableReasonType[] = ["PO Receipt"];

// Map API internal reason types to display names. Sale/Refund remain here so
// previews that include non-importable rows still render accurately.
export const REASON_TO_DISPLAY: Record<string, ReasonType> = {
  SALE: "Sale",
  REFUND: "Refund",
  PO_RECEIPT: "PO Receipt",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  COUNT_ADJUSTMENT: "Count",
  DAMAGE: "Damage",
  LOSS: "Loss",
};

export const DISPLAY_TO_REASONS: Record<ImportableReasonType, string[]> = {
  "PO Receipt": ["PO_RECEIPT"],
  "Transfer": ["TRANSFER_IN", "TRANSFER_OUT"],
  "Count": ["COUNT_ADJUSTMENT"],
  "Damage": ["DAMAGE"],
  "Loss": ["LOSS"],
};
