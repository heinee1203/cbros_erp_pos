export type PrintPreset = "concise-quarter" | "concise-half" | "detailed" | "internal-copy";

export type DocumentActionState = {
  canView?: boolean;
  canReprint?: boolean;
  canPrintReceipt?: boolean;
  canPay?: boolean;
  canVoid?: boolean;
};

export type DocumentTraceLink = {
  label: string;
  href: string;
  documentNumber?: string | null;
};

export const PRINT_PRESETS: Record<PrintPreset, { label: string; description: string }> = {
  "concise-quarter": {
    label: "Concise 1/4",
    description: "Compact receipt-sized printout for short payment proofs.",
  },
  "concise-half": {
    label: "Concise 1/2",
    description: "Half-letter crosswise statement for short SOAs or small document sets.",
  },
  detailed: {
    label: "Detailed",
    description: "Full detail printout with all available document rows.",
  },
  "internal-copy": {
    label: "Internal Copy",
    description: "Operational copy with audit and stock/accounting context where available.",
  },
};

export const DOCUMENT_ACTION_LABELS = {
  view: "View",
  reprint: "Reprint",
  receipt: "Receipt",
  pay: "Pay",
  void: "Void",
} as const;

export function customerSOAPresetToMode(preset: PrintPreset): "concise" | "detailed" {
  return preset === "detailed" || preset === "internal-copy" ? "detailed" : "concise";
}
