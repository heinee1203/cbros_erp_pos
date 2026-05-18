export const STATUS_TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "INCLUDED_IN_PO", label: "Included in PO" },
  { key: "FULFILLED", label: "Fulfilled" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "ALL", label: "All" },
] as const;

export const PRIORITY_BADGES: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  NORMAL: "bg-blue-100 text-blue-700",
  LOW: "bg-gray-100 text-gray-600",
};

export const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "High",
  NORMAL: "Normal",
  LOW: "Low",
};

export const STATUS_BADGES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  INCLUDED_IN_PO: "bg-blue-100 text-blue-700",
  FULFILLED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  INCLUDED_IN_PO: "Included in PO",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};
