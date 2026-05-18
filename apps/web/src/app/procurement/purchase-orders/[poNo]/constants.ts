export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-primary/10 text-primary",
  PARTIALLY_RECEIVED: "bg-warning/10 text-warning",
  FULLY_RECEIVED: "bg-success/10 text-success",
  CLOSED_WITH_VARIANCE: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PARTIALLY_RECEIVED: "Partially Received",
  FULLY_RECEIVED: "Fully Received",
  CLOSED_WITH_VARIANCE: "Closed (Variance)",
  CANCELLED: "Cancelled",
};

export const TERMINAL_STATES = new Set([
  "FULLY_RECEIVED",
  "CLOSED_WITH_VARIANCE",
  "CANCELLED",
]);

export const RECEIVABLE_STATES = new Set(["SUBMITTED", "PARTIALLY_RECEIVED"]);

export const EDITABLE_STATES = new Set(["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"]);
